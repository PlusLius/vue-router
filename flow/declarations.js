declare var document: Document;

declare class RouteRegExp extends RegExp {
  keys: Array<{ name: string, optional: boolean }>;
}

declare type PathToRegexpOptions = {
  sensitive?: boolean,
  strict?: boolean,
  end?: boolean
}

declare module 'path-to-regexp' {
  declare module.exports: {
    (path: string, keys?: Array<?{ name: string }>, options?: PathToRegexpOptions): RouteRegExp;
    compile: (path: string) => (params: Object) => string;
  }
}

declare type Dictionary<T> = { [key: string]: T }

declare type NavigationGuard = (
  to: Route,
  from: Route,
  next: (to?: RawLocation | false | Function | void) => void
) => any

declare type AfterNavigationHook = (to: Route, from: Route) => any

type Position = { x: number, y: number };
type PositionResult = Position | { selector: string, offset?: Position } | void;

declare type RouterOptions = {
  routes?: Array<RouteConfig>;
  mode?: string;
  fallback?: boolean;
  base?: string;
  linkActiveClass?: string;
  linkExactActiveClass?: string;
  parseQuery?: (query: string) => Object;
  stringifyQuery?: (query: Object) => string;
  scrollBehavior?: (
    to: Route,
    from: Route,
    savedPosition: ?Position
  ) => PositionResult | Promise<PositionResult>;
}

declare type RedirectOption = RawLocation | ((to: Route) => RawLocation)

declare type RouteConfig = {
  path: string;
  name?: string;
  component?: any;
  components?: Dictionary<any>;
  redirect?: RedirectOption;
  alias?: string | Array<string>;
  children?: Array<RouteConfig>;
  beforeEnter?: NavigationGuard;
  meta?: any;
  props?: boolean | Object | Function;
  caseSensitive?: boolean;
  pathToRegexpOptions?: PathToRegexpOptions;
}

declare type RouteRecord = {
  path: string;
  alias: Array<string>;
  regex: RouteRegExp;
  components: Dictionary<any>;
  instances: Dictionary<any>;
  enteredCbs: Dictionary<Array<Function>>;
  name: ?string;
  parent: ?RouteRecord;
  redirect: ?RedirectOption;
  matchAs: ?string;
  beforeEnter: ?NavigationGuard;
  meta: any;
  props: boolean | Object | Function | Dictionary<boolean | Object | Function>;
}

// Vue-Router 中定义的 Location 数据结构和浏览器提供的 
// window.location 部分结构有点类似，它们都是对 url 的结构化描述。举个例子：/abc?foo=bar&baz=qux#hello，
// 它的 path 是 /abc，query 是 {foo:'bar',baz:'qux'}。Location 的其他属性我们之后会介绍。
declare type Location = {
  _normalized?: boolean;
  name?: string;
  path?: string;
  hash?: string;
  query?: Dictionary<string>;
  params?: Dictionary<string>;
  append?: boolean;
  replace?: boolean;
}

declare type RawLocation = string | Location

// Route 表示的是路由中的一条线路，它除了描述了类似 Loctaion 的 path、query、hash 这些概念，
// 还有 matched 表示匹配到的所有的 RouteRecord。
declare type Route = {
  path: string;
  name: ?string;
  hash: string;
  query: Dictionary<string>;
  params: Dictionary<string>;
  fullPath: string;
  matched: Array<RouteRecord>;
  redirectedFrom?: string;
  meta?: any;
}
