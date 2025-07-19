/* 初始化前确保vosk.js已加载 */
class SpeechRecognizer {
    #voiceOverlay; //语音识别面板遮罩
    #voicePanel; //语音识别面板
    #voiceStatus; //语音识别状态显示
    #finalResult; //语音识别最终结果
    #partialResult; //语音识别实时结果
    #isProcessing = false; //防止连续点击
    #isRecognizing = false;
    #model = null;
    #recognizer = null;
    #audioContext = null;
    #mediaStream = null;
    #sourceNode = null;
    #recognizerProcessor = null;
    #channel = null; //连接通道
    #voskModelPath; //vosk语音识别模型文件的url路径
    #sampleRate = 48000; //采样率
  
    constructor(parentClassName, voskModelPath, callback) {
      this.#voskModelPath = voskModelPath;
      this.createVoicePanel(parentClassName, callback);
    }
    /* 启动语音识别 */
    async start() {
      this.#showOverlay(); //打开遮罩层
      if (this.#isProcessing) return;
      this.#isProcessing = true;
      try {
        if (!this.#isRecognizing) {
          // 重置面板
          this.#partialResult.textContent = "";
          this.#finalResult.textContent = "";
          this.#log("正在初始化语音识别...");
          await this.#loadModel();
          this.#log("正在连接音频设备...");
          await this.#setupAudio();
          this.#log("系统就绪，可以开始说话");
          this.#isRecognizing = true;
        }
      } catch (error) {
        this.#handleError(error);
      } finally {
        this.#isProcessing = false;
      }
    }
    /* 停止语音识别 */
    async stop(callback) {
      try {
        // this.#log("正在停止识别...");
        if (typeof callback === 'function') {
          // 识别结束后将最终结果回传至回调函数
          callback(this.#finalResult.textContent);
        }
        this.#hideOverlay();
        await this.#cleanupResources();
        this.#isRecognizing = false;
        // this.#log("识别已停止");
      } catch (error) {
        this.#handleError(error);
      }
    }
    /* 加载模型 */
    async #loadModel() {
      if (!this.#model) {
        this.#channel = new MessageChannel();
        this.#model = await Vosk.createModel(this.#voskModelPath);
        this.#model.registerPort(this.#channel.port1);
        this.#recognizer = new this.#model.KaldiRecognizer(this.#sampleRate);
        this.#recognizer.setWords(true); //识别粒度为单词级别
        
        this.#recognizer.on("result", (message) => this.#handleResult(message));
        this.#recognizer.on("partialresult", (message) => this.#handlePartialResult(message));
        this.#recognizer.on("error", (error) => this.#handleError(error));
      }
    }
    /* 加载音频 */
    async #setupAudio() {
      if (!this.#audioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.#audioContext = new AudioContext();
        await this.#audioContext.audioWorklet.addModule(this.#getAudioProcessor()); //加载自定义音频处理器
        this.#recognizerProcessor = new AudioWorkletNode(
          this.#audioContext,
          'recognizer-processor',
          { channelCount: 1, numberOfInputs: 1, numberOfOutputs: 1 }
        );
        this.#recognizerProcessor.port.postMessage(
          { action: 'init', recognizerId: this.#recognizer.id },
          [this.#channel.port2]
        );
        this.#recognizerProcessor.connect(this.#audioContext.destination);
      }
      //获取麦克风
      if (!this.#mediaStream) {
        this.#mediaStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
            sampleRate: this.#sampleRate
          },
        });
      }
  
      if (!this.#sourceNode) {
        this.#sourceNode = this.#audioContext.createMediaStreamSource(this.#mediaStream);
        this.#sourceNode.connect(this.#recognizerProcessor);
        this.#log("系统就绪，可以开始说话");
      }
    }
    // 自定义音频处理器转blob url避免使用外部单独js文件
    #getAudioProcessor(){
        let blobUrl = "";
        const customeProcessorCode = `
        class RecognizerAudioProcessor extends AudioWorkletProcessor {
            constructor(options) {
                super(options);
                this.port.onmessage = this._processMessage.bind(this);
            }
            _processMessage(event) {
                if (event.data.action === "init") {
                    this._recognizerId = event.data.recognizerId;
                    this._recognizerPort = event.ports[0];
                }
            }
            process(inputs, outputs, parameters) {
                const data = inputs[0][0];
                if (this._recognizerPort && data) {
                    const audioArray = data.map((value) => value * 0x8000);
                    this._recognizerPort.postMessage(
                        {
                            action: "audioChunk",
                            data: audioArray,
                            recognizerId: this._recognizerId,
                            sampleRate, // Part of AudioWorkletGlobalScope
                        },
                        {
                            transfer: [audioArray.buffer],
                        }
                    );
                }
                return true;
            }
        }
        registerProcessor('recognizer-processor', RecognizerAudioProcessor)
        `
        try {
            const codeBlob = new Blob([customeProcessorCode],{ type: 'application/javascript' });
            blobUrl = URL.createObjectURL(codeBlob);
        } catch (error) {
            console.log("Create custome audio processor blob url error:" + error);
        }
        return blobUrl;
    }
    /* 资源清理 */
    async #cleanupResources() {
      if (this.#sourceNode) {
        this.#sourceNode.disconnect();
        this.#sourceNode = null;
      }
      if (this.#mediaStream) {
        this.#mediaStream.getTracks().forEach(track => track.stop());
        this.#mediaStream = null;
      }
    }
    /* 识别的最终结果处理 */
    #handleResult(message) {
      this.#finalResult.textContent += message.result.text.replaceAll(/\s+/g, '');
    }
    /* 识别的实时结果处理 */
    #handlePartialResult(message) {
      this.#partialResult.textContent = message.result.partial;
    }
    /* 异常处理 */
    #handleError(error) {
      const errorMessage = `错误: ${error.message || error}`;
      console.error(errorMessage);
      this.#log(errorMessage, true);
      setTimeout(() => this.#hideOverlay(), 2000);
    }
    /* 状态记录 */
    #log(message, isTemp = false) {
      this.#voiceStatus.textContent = message;
    }
    /* 遮罩层处理 */
    #showOverlay() {
      this.#voiceOverlay.style.display = 'block';
    }
  
    #hideOverlay() {
      this.#voiceOverlay.style.display = 'none';
    }
    /* 创建语言识别面板 */
    createVoicePanel(parentClassName, stopCallback) {
      /*
        parentClassName : 指定挂接语音识别面板的父元素，为null则挂接body
        stopCallback ： 点击停止录音后的回调函数，将向函数传入识别文本
      */
      this.#voiceOverlay = document.createElement('div');
      this.#voiceOverlay.classList.add('voice-overlay');
      Object.assign(this.#voiceOverlay.style, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1100,
        display: 'none'
      });
  
      // 创建面板和子元素
      this.#voicePanel = document.createElement('div');
      this.#voicePanel.classList.add('voice-panel');
      Object.assign(this.#voicePanel.style, {
        position: 'absolute',
        top: '50%',
        width: '100%',
        justifyItems: 'center',
        text-align: 'center'
      });
      //临时结果
      this.#partialResult = document.createElement('div');
      this.#partialResult.id = 'voice-partial-result';
      Object.assign(this.#partialResult.style, {
        marginTop: '1%',
        marginBottom: '1%',
        padding: '15px',
        minHeight: '10px'
      });
      //最终结果
      this.#finalResult = document.createElement('div');
      this.#finalResult.id = 'voice-final-result';
      Object.assign(this.#finalResult.style, {
        marginTop: '1%',
        marginBottom: '2%',
        color: 'white',
        padding: '15px',
        minHeight: '10px'
      });
      //停止按钮
      const voiceStop = document.createElement('button');
      voiceStop.id = 'voice-stop-btn';
      Object.assign(voiceStop.style, {
        backgroundColor: 'red',
        border: 'none',
        borderRadius: '150px',
        color: 'white',
        width: '150px',
        height: '150px',
        fontSize: 'xx-large'
      });
      voiceStop.textContent = '停止'; //初始化停止按钮
      //绑定事件处理及回调函数
      voiceStop.addEventListener('click', () => this.stop(stopCallback));
      //状态呈现
      this.#voiceStatus = document.createElement('div');
      this.#voiceStatus.id = 'voice-status';
      Object.assign(this.#voiceStatus.style, {
        color: 'gray',
        marginTop: '5px',
        fontStyle: 'italic'
      });
  
      // 组装DOM结构
      this.#voicePanel.append(this.#partialResult, this.#finalResult, voiceStop, this.#voiceStatus);
      this.#voiceOverlay.appendChild(this.#voicePanel);
      // 如果指定父元素则将面板挂接在父元素，否则挂接到body
      let parentDOM = null;
      if (parentClassName) {
        parentDOM = document.querySelector(parentClassName);
      }
      parentDOM ? parentDOM.appendChild(this.#voiceOverlay) : document.body.appendChild(this.#voiceOverlay);
    }
  }