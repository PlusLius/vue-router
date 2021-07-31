/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn } from '../util/warn'
import { START, isSameRoute, handleRouteEntered } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import {
  createNavigationDuplicatedError,
  createNavigationCancelledError,
  createNavigationRedirectedError,
  createNavigationAbortedError,
  isError,
  isNavigationFailure,
  NavigationFailureType
} from '../util/errors'

export class History {
  router: Router
  base: string
  current: Route
  pending: ?Route
  cb: (r: Route) => void
  ready: boolean
  readyCbs: Array<Function>
  readyErrorCbs: Array<Function>
  errorCbs: Array<Function>
  listeners: Array<Function>
  cleanupListeners: Function

  // implemented by sub-classes
  +go: (n: number) => void
  +push: (loc: RawLocation, onComplete?: Function, onAbort?: Function) => void
  +replace: (
    loc: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) => void
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string
  +setupListeners: Function

  constructor (router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base)
    // start with a route object that stands for "nowhere"
    this.current = START
    this.pending = null
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
    this.listeners = []
  }

  listen (cb: Function) {
    this.cb = cb
  }

  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  transitionTo (
    location: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) {
    let route
    // catch redirect option https://github.com/vuejs/vue-router/issues/3201
    try {
      route = this.router.match(location, this.current)
    } catch (e) {
      this.errorCbs.forEach(cb => {
        cb(e)
      })
      // Exception should still be thrown
      throw e
    }
    const prev = this.current
    this.confirmTransition(
      route,
      () => {
        this.updateRoute(route)
        onComplete && onComplete(route)
        this.ensureURL()
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev)
        })

        // fire ready cbs once
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => {
        if (onAbort) {
          onAbort(err)
        }
        if (err && !this.ready) {
          // Initial redirection should not mark the history as ready yet
          // because it's triggered by the redirection instead
          // https://github.com/vuejs/vue-router/issues/3225
          // https://github.com/vuejs/vue-router/issues/3331
          if (!isNavigationFailure(err, NavigationFailureType.redirected) || prev !== START) {
            this.ready = true
            this.readyErrorCbs.forEach(cb => {
              cb(err)
            })
          }
        }
      }
    )
  }

  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    const current = this.current
    this.pending = route
    const abort = err => {
      // changed after adding errors with
      // https://github.com/vuejs/vue-router/pull/3047 before that change,
      // redirect and aborted navigation would produce an err == null
      if (!isNavigationFailure(err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }
    const lastRouteIndex = route.matched.length - 1
    const lastCurrentIndex = current.matched.length - 1
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      lastRouteIndex === lastCurrentIndex &&
      route.matched[lastRouteIndex] === current.matched[lastCurrentIndex]
    ) {
      this.ensureURL()
      return abort(createNavigationDuplicatedError(current, route))
    }

    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      // 在失活的组件里调用离开守卫。
      extractLeaveGuards(deactivated),
      // global before hooks
      // 调用全局的 beforeEach 守卫。
      this.router.beforeHooks,
      // in-component update hooks
      // 在重用的组件里调用 beforeRouteUpdate 守卫
      extractUpdateHooks(updated),
      // in-config enter guards
      // 在激活的路由配置里调用 beforeEnter。
//       第四步是执行 activated.map(m => m.beforeEnter)，获取的是在激活的路由配置中定义的 beforeEnter 函数。
      activated.map(m => m.beforeEnter),
      // async components
      // 解析异步路由组件。
//       第五步是执行 resolveAsyncComponents(activated) 解析异步组件，先来看一下 resolveAsyncComponents 的定义，
      resolveAsyncComponents(activated)
    )
// iterator 函数逻辑很简单，它就是去执行每一个 导航守卫 hook
//     并传入 route、current 和匿名函数，这些参数对应文档中的 to、from、next
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        hook(route, current, (to: any) => {
//                   当执行了匿名函数，会根据一些条件执行 abort 或 next
          if (to === false) {
            // next(false) -> abort navigation, ensure current URL
            this.ensureURL(true)
            abort(createNavigationAbortedError(current, route))
          } else if (isError(to)) {
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort(createNavigationRedirectedError(current, route))
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
//             只有执行 next 的时候，才会前进到下一个导航守卫钩子函数中，这也就是为什么官方文档会说只有执行 next 方法来 resolve 这个钩子函数
            // confirm transition and pass on the value
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    runQueue(queue, iterator, () => {
      // wait until async components are resolved before
      // extracting in-component enter guards
//       这样在 resolveAsyncComponents(activated) 解析完所有激活的异步组件后，我们就可以拿到这一次所有激活的组件。这样我们在做完这 5 步后又做了一些事情
//       在被激活的组件里调用 beforeRouteEnter。
      const enterGuards = extractEnterGuards(activated)
//       调用全局的 beforeResolve 守卫。
      const queue = enterGuards.concat(this.router.resolveHooks)
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null
        onComplete(route)
        if (this.router.app) {
//           在根路由组件重新渲染后，遍历 postEnterCbs 执行回调，每一个回调执行的时候，其实是执行 poll(cb, match.instances, key, isValid) 方法，因为考虑到一些了路由组件被套 transition 組件在一些缓动模式下不一定能拿到实例，所以用一个轮询方法不断去判断，直到能获取到组件实例，再去调用 cb，并把组件实例作为参数传入，这就是我们在回调函数中能拿到组件实例的原因。
          this.router.app.$nextTick(() => {
            // 调用全局的 afterEach 钩子。
            handleRouteEntered(route)
          })
        }
      })
    })
  }

  updateRoute (route: Route) {
    this.current = route
    this.cb && this.cb(route)
  }

  setupListeners () {
    // Default implementation is empty
  }

  teardown () {
    // clean up event listeners
    // https://github.com/vuejs/vue-router/issues/2341
    this.listeners.forEach(cleanupListener => {
      cleanupListener()
    })
    this.listeners = []

    // reset current history route
    // https://github.com/vuejs/vue-router/issues/3294
    this.current = START
    this.pending = null
  }
}

function normalizeBase (base: ?string): string {
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}

function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
//     这里用到了 flatMapComponents 方法去从 records 中获取所有的导航
//     那么对于 extractGuards 中 flatMapComponents 的调用，执行每个 fn 的时候，通过 extractGuard(def, name) 获取到组件中对应 name 的导航守卫
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name) // 获取到 guard 后
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key) // 还会调用 bind 方法把组件的实例 instance 作为函数执行的上下文绑定到 guard 上，
    }
  })
  return flatten(reverse ? guards.reverse() : guards)
}
// 通过 extractGuard(def, name) 获取到组件中对应 name 的导航守卫
function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}

function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
//   它内部调用了 extractGuards 的通用方法，可以从 RouteRecord 数组中提取各个阶段的守卫：
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}
// 和 extractLeaveGuards(deactivated) 类似，extractUpdateHooks(updated) 获取到的就是所有重用的组件中定义的 beforeRouteUpdate 钩子函数。
function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  // ，extractUpdateHooks(updated) 获取到的就是所有重用的组件中定义的 beforeRouteUpdate 钩子函数
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}
// 那么对于 extractLeaveGuards(deactivated) 而言，获取到的就是所有失活组件中定义的 beforeRouteLeave 钩子函数。
function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}
// extractEnterGuards 函数的实现也是利用了 extractGuards 方法提取组件中的 beforeRouteEnter 导航钩子函数，和之前不同的是 bind 方法的不同。
// 文档中特意强调了 beforeRouteEnter 钩子函数中是拿不到组件实例的，因为当守卫执行前，组件实例还没被创建，
// 但是我们可以通过传一个回调给 next 来访问组件实例。在导航被确认的时候执行回调，并且把组件实例作为回调方法的参数
function extractEnterGuards (
  activated: Array<RouteRecord>
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key)
    }
  )
}
// 在 bindEnterGuard 函数中，返回的是 routeEnterGuard 函数
// 所以在执行 iterator 中的 hook 函数的时候，就相当于执行 routeEnterGuard 函数，
// 那么就会执行我们定义的导航守卫 guard 函数，并且当这个回调函数执行的时候，
// 首先执行 next 函数 rersolve 当前导航钩子，然后把回调函数的参数，
// 它也是一个回调函数用 cbs 收集起来，其实就是收集到外面定义的 postEnterCbs 中
function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        if (!match.enteredCbs[key]) {
          match.enteredCbs[key] = []
        }
        match.enteredCbs[key].push(cb)
      }
      next(cb)
    })
  }
}
