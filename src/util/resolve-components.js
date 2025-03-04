/* @flow */

import { _Vue } from '../install'
import { warn } from './warn'
import { isError } from '../util/errors'
// resolveAsyncComponents 返回的是一个导航守卫函数，有标准的 to、from、next 参数。它的内部实现很简单，
// 利用了 flatMapComponents 方法从 matched 中获取到每个组件的定义，判断如果是异步组件，则执行异步组件加载逻辑，
// 这块和我们之前分析 Vue 加载异步组件很类似，加载成功后会执行 match.components[key] = resolvedDef 
// 把解析好的异步组件放到对应的 components 上，并且执行 next 函数。
export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
  return (to, from, next) => {
    let hasAsync = false
    let pending = 0
    let error = null

    flatMapComponents(matched, (def, _, match, key) => {
      // if it's a function and doesn't have cid attached,
      // assume it's an async component resolve function.
      // we are not using Vue's default async resolving mechanism because
      // we want to halt the navigation until the incoming component has been
      // resolved.
      if (typeof def === 'function' && def.cid === undefined) {
        hasAsync = true
        pending++

        const resolve = once(resolvedDef => {
          if (isESModule(resolvedDef)) {
            resolvedDef = resolvedDef.default
          }
          // save resolved on async factory in case it's used elsewhere
          def.resolved = typeof resolvedDef === 'function'
            ? resolvedDef
            : _Vue.extend(resolvedDef)
          match.components[key] = resolvedDef
          pending--
          if (pending <= 0) {
            next()
          }
        })

        const reject = once(reason => {
          const msg = `Failed to resolve async component ${key}: ${reason}`
          process.env.NODE_ENV !== 'production' && warn(false, msg)
          if (!error) {
            error = isError(reason)
              ? reason
              : new Error(msg)
            next(error)
          }
        })

        let res
        try {
          res = def(resolve, reject)
        } catch (e) {
          reject(e)
        }
        if (res) {
          if (typeof res.then === 'function') {
            res.then(resolve, reject)
          } else {
            // new syntax in Vue 2.3
            const comp = res.component
            if (comp && typeof comp.then === 'function') {
              comp.then(resolve, reject)
            }
          }
        }
      }
    })

    if (!hasAsync) next()
  }
}
// flatMapComponents 的作用就是返回一个数组，数组的元素是从 matched 里获取到所有组件的 key，然后返回 fn 函数执行的结果，
export function flatMapComponents (
  matched: Array<RouteRecord>,
  fn: Function
): Array<?Function> {
//   flatten 作用是把二维数组拍平成一维
  return flatten(matched.map(m => {
//   数组的元素是从 matched 里获取到所有组件的 key, 然后返回 fn 函数执行的结果，
    return Object.keys(m.components).map(key => fn(
      m.components[key],
      m.instances[key],
      m, key
    ))
  }))
}

export function flatten (arr: Array<any>): Array<any> {
  return Array.prototype.concat.apply([], arr)
}

const hasSymbol =
  typeof Symbol === 'function' &&
  typeof Symbol.toStringTag === 'symbol'

function isESModule (obj) {
  return obj.__esModule || (hasSymbol && obj[Symbol.toStringTag] === 'Module')
}

// in Webpack 2, require.ensure now also returns a Promise
// so the resolve/reject functions may get called an extra time
// if the user uses an arrow function shorthand that happens to
// return that Promise.
function once (fn) {
  let called = false
  return function (...args) {
    if (called) return
    called = true
    return fn.apply(this, args)
  }
}
