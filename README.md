<h1 align="center">Vosk Browser Demo</h1>
<p align="center">
  <img src="https://img.shields.io/badge/Vosk.js-0.0.8-blue" alt="Python"/>
</p>
<hr>



## 简介

该仓库是Vosk Browser一个demo示例。

Vosk Browser来自另一个项目**Vosk**，其封装了 Vosk 的 `WebAssembly` 版本，Vosk 是一个开源的语音识别工具包，支持多语言和离线语音识别。Vosk-Browser这个项目通过 WebAssembly 将 Vosk 移植到浏览器环境中。


## 功能

- 纯前端实现语音识别导入功能。



## 开发环境

编辑器：Visual Studio Code

开发语言：Javascript


## 代码结构说明

```
vosk-browser-demo
├── js  # 必须js文件
├── models   # 模型文件
├── index.html  #默认页面
└── README.md
```

## 使用示例

```javascript
<script>
   //创建语音识别组件
   const recognizer = new SpeechRecognizer(
       null,  //组件挂载的父容器className
       'models/vosk-model-small-cn-0.3.tar.gz',  //模型路径
       (voiceText) => {    //语音识别之后的回调函数
           document.getElementById('textInput').value += voiceText;
       }
   );

   //绑定到语音识别按钮的click事件
   document.getElementById('recordButton').addEventListener('click', function() {
       recognizer.start(); //启动语音识别
   });
</script>
```
