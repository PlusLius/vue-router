import View from './components/view'
import Link from './components/link'

export let _Vue
// install过程主要是为了混入插件的生命周期，添加原型方法，注册全局组件
export function install (Vue) {
  // 注册过返回
//   为了确保 install 逻辑只执行一次，用了 install.installed 变量做已安装的标志位。
//   另外用一个全局的 _Vue 来接收参数 Vue，因为作为 Vue 的插件对 Vue 对象是有依赖的，
//   但又不能去单独去 import Vue，因为那样会增加包体积，所以就通过这种方式拿到 Vue 对象
  if (install.installed && _Vue === Vue) return
  // 注册的时候记录一下
  install.installed = true
  // 注册的记录一下Vue构造函数
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    // 在创建组件之前，拿到父Vnode，执行父创建组件的生命周期钩子init函数
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }
  // 将生命周期钩子混入到根实例
//   Vue-Router 安装最重要的一步就是利用 Vue.mixin 去把 beforeCreate 和 destroyed 钩子函数注入到每一个组件中。
//   先看混入的 beforeCreate 钩子函数，对于根 Vue 实例而言，执行该钩子函数时定义了 this._routerRoot 表示它自身；
//   this._router 表示 VueRouter 的实例 router，它是在 new Vue 的时候传入的；另外执行了 this._router.init() 方法初始化 router，这个逻辑之后介绍，
//   然后用 defineReactive 方法把 this._route 变成响应式对象，这个作用我们之后会介绍。而对于子组件而言，
//   由于组件是树状结构，在遍历组件树的过程中，它们在执行该钩子函数的时候 this._routerRoot 始终指向的离它最近的传入了 router 对象作为配置而实例化的父实例。

// 对于 beforeCreate 和 destroyed 钩子函数，它们都会执行 registerInstance 方法，这个方法的作用我们也是之后会介绍。

// 接着给 Vue 原型上定义了 $router 和 $route 2 个属性的 get 方法，这就是为什么我们可以在组件实例上可以访问 this.$router 以及 this.$route，它们的作用之后介绍。

// 接着又通过 Vue.component 方法定义了全局的 <router-link> 和 <router-view> 2 个组件，这也是为什么我们在写模板的时候可以使用这两个标签，它们的作用也是之后介绍。

// 最后定义了路由中的钩子函数的合并策略，和普通的钩子函数一样
  Vue.mixin({
    beforeCreate () {
      // 没挂载router时
      if (isDef(this.$options.router)) {
        // 对于根 Vue 实例而言，执行该钩子函数时定义了 this._routerRoot 表示它自身；
        this._routerRoot = this 
        //  this._router 表示 VueRouter 的实例 router，
        this._router = this.$options.router
        // ；另外执行了 this._router.init() 方法初始化 router
        this._router.init(this)
        // 在util下挂载一个_route的响应属性记录history
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // this._routerRoot 始终指向的离它最近的传入了 router 对象作为配置而实例化的父实例。
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })
  // vue.prototype.$router, vue.prototype.$route 定义成响应式
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })
  // 注册RouterView和RouterLink 2个全局组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)
  // 拿到options合并策略
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  // beforeRouteEnter，beforeRouteLeave，beforeRouteUpdate 这几个钩子函数和created使用相同的合并策略
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
