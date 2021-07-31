/* @flow */
// 官方的说法叫导航守卫，实际上就是发生在路由路径切换的时候，执行的一系列钩子函数。
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
//    我们先从整体上看一下这些钩子函数执行的逻辑，首先构造一个队列 queue，它实际上是一个数组；
  const step = index => {
    if (index >= queue.length) {
      cb()
    } else {
      if (queue[index]) {
//         然后再定义一个迭代器函数 iterator；
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        step(index + 1)
      }
    }
  }
//   最后再执行 runQueue 方法来执行这个队列。我们先来看一下 runQueue 的定义
  step(0)
}
