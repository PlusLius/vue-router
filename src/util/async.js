/* @flow */
// 官方的说法叫导航守卫，实际上就是发生在路由路径切换的时候，执行的一系列钩子函数。
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
//    我们先从整体上看一下这些钩子函数执行的逻辑，首先构造一个队列 queue，它实际上是一个数组；
//   这是一个非常经典的异步函数队列化执行的模式， queue 是一个 NavigationGuard 类型的数组
//   我们定义了 step 函数，每次根据 index 从 queue 中取一个 guard，然后执行 fn 函数，并且把 guard 作为参数传入
  // 第二个参数是一个函数，当这个函数执行的时候再递归执行 step 函数 前进到下一个，注意这里的 fn 就是我们刚才的 iterator 函数，那么我们再回到 iterator 函数的定义：
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
