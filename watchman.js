/**
 * Watchman -- A nano-size client-side router
 *
 *   watchman({
 *     '/': index,
 *     '/user/:id': user,
 *     '/page/:slag': page
 *   });
 *   watchman.use(function(ctx, next) {
 *     // parse query
 *     ctx.query = qs.parse(location.search.slice(1));
 *     next();
 *   });
 *   watchman.run(); //watchman();
 *
 * Version:
 *   v0.0.1
 *
 * Author:
 *   Will Wen Gunn(willwengunn@gmail.com)
 *
 * License:
 *   BSD
 */
;(function(name, def) {
  var hasDefine  = 'undefined' !== typeof define;
  var hasExports = 'undefined' !== typeof exports;

  if (hasDefine) {
    // CommonJS: SeaJS, RequireJS etc.
    define(name, [], def);
  } else if (hasExports) {
    // Node.js Module
    exports = def(require, exports, module);
  } else {
    // Normal
    this[name] = def();
  }
})('watchman', function() {

  var global = global || window;

  /**
   * watchman
   *
   *   watchman('/', function(ctx) {
   *     console.log('I am on index.');
   *   });
   *   watchman({
   *     '/users': function(ctx) {
   *       console.log('I am showing the list of the users.');
   *     },
   *     '/user/:id': function(ctx) {
   *       console.log('I am showing a user. ID: %s', ctx.params.id);
   *     }
   *   });
   *   watchman('/user/' + user.id);
   *   watchman();
   * 
   * @param  {String/Object} path    path
   * @param  {Function} handler handle callback
   * 
   */
  function watch(path, handler) {

    if (arguments.length < 2) {

      // run
      if (arguments.length === 0) {
        return watch.run();
      }

      switch (typeof path) {
        case 'object':
          // webjs style
          for (var _path in path) {
            watch(_path, path[_path]);
          }
          break;
        case 'string':
          // express style
          watch.run({ url: path });
          break;
      }
      return;

    } else {
      // normal
      if (!global.hasOwnProperty('_watching')) {
        // rules
        global._watching = [];
      }

      var rule = createRule(path, handler);
      global._watching.push(rule);
    }

    return watch;
  };

  /**
   * Use some middlewares
   *
   *   watchman.use(
   *     function(ctx, next) {
   *       ctx.query = {}; // parse query string
   *       next();
   *     },
   *     function(ctx, next) {
   *       ctx.browser = {}; // parse browser info
   *       next();
   *     }
   *   );
   */
  watch.use = function() {
    if (!global.hasOwnProperty('_watchman_middlewares')) {
      // middlewares
      global._watchman_middlewares = [];
    }
    var middlewares = slice(arguments);

    Array.prototype.push.apply(global._watchman_middlewares, middlewares);

    return watch;
  };

  /**
   * run
   *
   *   watchman.run();
   *   watchman.run({
   *     url: '/user/' + user.id
   *   });
   * 
   * @param  {Object} option option
   */
  watch.run = function(option) {
    option = option || {};

    // current path
    var path     = option.url || global.location.pathname + global.location.hash;
    var watching = global._watching;

    for (var i = 0; i < watching.length; i++) {
      if (watching[i].regexp.exec(path)) {
        // Hit!

        // params
        var params = paramsParser(path, watching[i]);

        var ctx = {
          params: params
        };
        var hit = watching[i].handler;

        // run the middlewares
        if (global.hasOwnProperty('_watchman_middlewares')) {
          var _i = 0;

          function layer(index) {
            var curr = global._watchman_middlewares[index];

            if (curr) {
              curr(ctx, function() {
                layer(++_i);
              });
            } else {
              hit(ctx);
            }
          }

          layer(_i);
        } else {
          hit(ctx);
        }

      }
    }

    return watch;
  };

  /**
   * create a rule
   * @param  {String}  path    path
   * @param  {Funtion} handler handle callback
   * @return {Object}          rule object
   */
  function createRule(path, handler) {

    var rule = pathToRegExp(path);
    rule.handler = handler;

    return rule;
  }

  /**
   * Convert the path string to a RegExp object
   * @param  {String} path path
   * @return {RegExp}      RegExp object
   */
  function pathToRegExp(path) {
    if (path instanceof RegExp) {
      return {
        keys: [],
        regexp: path
      };
    }
    if (path instanceof Array) {
      path = '(' + path.join('|') + ')';
    }

    var rtn = {
      keys: [],
      regexp: null
    };

    rtn.regexp = new RegExp(
      '^' + (isHashRouter(path) ? '\/' : '') + path
        .replace(/([\/\(]+):/g, '(?:')
        .replace(/\(\?:(\w+)((\(.*?\))*)/g, function(_, key, optional) {
          if (optional) {
            var match = optional.replace(/\(|\)/g, '');
          } else {
            var match = '\/?([^\/]+)';
          }
          return '(?:' + match + '?)';
        })
        // fix double closing brackets, are there any better cases?
        // make a commit and send us a pull request. XD
        .replace('))', ')')
        .replace(/\*/g, '(.*)') + '$'
    , 'i');
    
    return rtn;
  }

  /**
   * url params parser
   * @param  {String} url  current url
   * @param  {Object} rule matched rule
   * @return {Object}      params
   */
  function paramsParser(url, rule) {
    var matches = rule.regexp.exec(url).slice(1);
    var keys = rule.keys;
    var params = {};

    for (var i = 0; i < keys.length; i++) {
      params[keys[i]] = matches[i];
    }

    return params;
  }

  // Utils

  function isHashRouter(path) {
    return /^#/.test(path);
  }
  function slice(args) {
    var rtn = [];
    for (var i = 0; i < args.length; i++) {
      rtn.push(args[i])
    }
    return rtn;
  }

  return watch;
});
