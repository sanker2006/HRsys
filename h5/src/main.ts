import { createApp } from 'vue'
import router from './router'
import App from './App.vue'
import 'vant/lib/index.css'
// ✅ 全局注册 Vant 组件，所有页面无需单独 import
import {
  Form,
  CellGroup,
  Field,
  Button,
  Cell,
  Card,
  Tag,
  Empty,
  List,
  PullRefresh,
  NavBar,
  Slider,
  Stepper,
  Tabbar,
  TabbarItem,
  Dialog,
} from 'vant'

const vantComponents = [
  Form,
  CellGroup,
  Field,
  Button,
  Cell,
  Card,
  Tag,
  Empty,
  List,
  PullRefresh,
  NavBar,
  Slider,
  Stepper,
  Tabbar,
  TabbarItem,
  Dialog,
]

const app = createApp(App)

// 调用每个组件的 install 方法，自动注册 <van-xxx> 到 Vue
for (const c of vantComponents) {
  app.use(c)
}

app.use(router)
app.mount('#app')
