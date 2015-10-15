let global = global || window

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
function watch(...args) {
  let path = args[0]
  let handler = args[1]

  if (args.length < 2) {

    // Run
    if (args.length === 0)
      return watch.run()

    switch (typeof path) {
      case 'object':
        for (let _path in path) {
          watch(_path, path[_path])
        }
        break

      case 'string':
        watch.run({ url: path })
        break

      default:
        throw new Error('Illage usage.')
    }

    return watch
  } else {
    if (!('_watching' in watch)) {
      watch._watching = []
    }

    let rule = createRule(path, handler)
    watch._watching.push(rule)
  }

  return watch
}

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
watch.use = (...args) => {
  if (!('_watchman_middlewares' in watch))
    watch._watchman_middlewares = []

  Array.prototype.push.apply(watch._watchman_middlewares, args)

  return watch
}

/**
 * Run the router
 *
 *   watchman.run();
 *   watchman.run({
 *     url: '/user/' + user.id
 *   });
 * 
 * @param  {Object} options options
 */
watch.run = function(options = {}) {

  // current path
  let path     = options.url || global.location.pathname + global.location.hash
  let watching = watch._watching

  watch.emit('statechange', path)

  for (let i = 0; i < watching.length; i++) {
    if (watching[i].regexp.exec(path)) {
      // Hit!

      // params
      let params = paramsParser(path, watching[i])

      let ctx = {
        params: params,
        path: path
      };
      let hit = watching[i].handler

      // run the middlewares
      if ('_watchman_middlewares' in watch) {
        let _i = 0;

        function layer(index) {
          let curr = watch._watchman_middlewares[index]

          if (curr) {
            curr(ctx, function() {
              layer(++_i)
            });
          } else {
            hit(ctx)
          }
        }

        layer(_i)
      } else {
        hit(ctx)
      }

      break
    }
  }

  if (!watch.running) {
    if ('onhashchange' in global) {
      switch ('function') {
        case typeof global.addEventListener:
          global.addHashChange = function(func, before) {
            global.addEventListener('hashchange', func, before)
          }
          global.removeHashChange = function(func) {
            global.removeEventListener('hashchange', func)
          }
          break
        case typeof global.attachEvent:
          global.addHashChange = function(func) {
            global.attachEvent('onhashchange', func)
          }
          global.removeHashChange = function(func) {
            global.detachEvent('onhashchange', func)
          }
          break
        default:
          global.addHashChange = function(func) {
            global.onhashchange = func
          }
          global.removeHashChange = function(func) {
            if (global.onhashchange == func) {
              global.onhashchange = null
            }
          }
      }
      let shim = ['pushState', 'replaceState']
      for (let i = 0; i < shim.length; i++) {
        (function(name) {
          let method = global.history[name];

          if (method) {
            global.history[name] = function() {
              let rtn = method.apply(global.history, arguments)
              watch.run()
              return rtn
            }
          }
        })(shim[i])
      }
    } else {
      let hashChangeFuncs =  watch.hashChangeFuncs = []
      watch.oldHref = global.location.href
      global.addHashChange = function(func, before) {
        if (typeof func === 'function') {
          watch.hashChangeFuncs[before?'unshift':'push'](func);
        }
      }
      global.removeHashChange = function(func) {
        for (let i = hashChangeFuncs.length - 1;i >= 0;--i) {
          if (hashChangeFuncs[i] === func) {
            hashChangeFuncs.splice(i, 1)
          }
        }
      };
      setInterval(function() {
        let newHref = global.location.href
        if (watch.oldHref !== newHref) {
          watch.oldHref = newHref
          for (let i=0; i < hashChangeFuncs.length; i++) {
            hashChangeFuncs[i].call(global, {
              'type': 'hashchange',
              'newURL': newHref,
              'oldURL': watch.oldHref
            })
          }
        }
      }, 100)
    }

    global.addHashChange(function() {
      watch.run()
    })

    watch.emit('watching')
    watch.running = true
    if (options.callback && options.callback instanceof Function) {
      options.callback()
    }
  }

  return watch;
}

/**
 * Get and set the base of the routers.
 * @param  {String} base base path
 * @return {Function}      watchman
 */
watch.base = function(base) {
  if (arguments.length == 0)
    return watch.__base

  watch.__base = base

  return watch
}
watch.__base = ''

/**
 * create a rule
 * @param  {String}  path    path
 * @param  {Funtion} handler handle callback
 * @return {Object}          rule object
 */
function createRule(path, handler) {
  if ('*' !== path && 0 != path.indexOf(watch.__base)) {
    path = watch.__base + (path == '/' ? '' : path)
  }
  let rule = pathToRegExp(path)
  if (handler instanceof String) {
    let target = handler
    handler = function() {
      watch({
        url: target
      })
    }
  }
  rule.handler = handler

  return rule
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
    }
  }
  if (path instanceof Array) {
    path = '(' + path.join('|') + ')'
  }

  let rtn = {
    keys: [],
    regexp: null
  }

  rtn.regexp = new RegExp(
    (isHashRouter(path) ? '' : '^' ) + path
      .replace(/([\/\(]+):/g, '(?:')
      .replace(/\(\?:(\w+)((\(.*?\))*)/g, function(_, key, optional) {
        rtn.keys.push(key)
        let match = null
        if (optional) {
          match = optional.replace(/\(|\)/g, '')
        } else {
          match = '\/?([^\/]+)'
        }
        return '(?:' + match + '?)'
      })
      // fix double closing brackets, are there any better cases?
      // make a commit and send us a pull request. XD
      .replace('))', ')')
      .replace(/\*/g, '(.*)') + '((#.+)?)$'
  , 'i')
  
  return rtn
}

// Events
// 
watch.on = function(type, listener) {
  if (!('_events' in watch))
    watch._events = {}

  if (typeof listener !== 'function')
    throw TypeError('listener must be a function')

  if (!this._events[type])
    this._events[type] = []

  this._events[type].push(listener)
  return watch
}

watch.once = function(type, listener) {
  if (typeof listener !== 'function')
    throw TypeError('listener must be a function')

  function g() {
    watch.removeEventListener(type, g)
    listener.apply(watch, arguments)
  }
  watch.on(type, g)
  return watch
}

watch.emit = function(type) {
  if (!('_events' in watch))
    watch._events = {}

  let handlers = watch._events[type]

  if (handlers) {
    for (let i = 0; i < handlers.length; i++) {
      let args = slice(arguments).slice(1)
      handlers[i].apply(watch, args)
    }
  }
  return watch
}

watch.removeEventListener = function(type, listener) {
  if (!('_events' in watch))
    watch._events = {}

  if (typeof listener !== 'function')
    throw TypeError('listener must be a function')

  let handlers = watch._events[type]
  if (handlers) {
    let i = handlers.indexOf(listener)
    handlers.splice(i, 1)
  }
  return watch
}

watch.removeAllListeners = function(type) {
  if (!('_events' in watch)) {
    watch._events = {};
  }

  delete watch._events[type]
  return watch
}

/**
 * url params parser
 * @param  {String} url  current url
 * @param  {Object} rule matched rule
 * @return {Object}      params
 */
function paramsParser(url, rule) {
  let matches = rule.regexp.exec(url).slice(1)
  let keys = rule.keys
  let params = {}

  for (let i = 0; i < keys.length; i++) {
    params[keys[i]] = matches[i]
  }

  return params
}

// Utils

function isHashRouter(path) {
  return /^#/.test(path);
}

export default watch