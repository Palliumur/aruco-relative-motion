# ArUco 相对位移

在浏览器中实时测量两个物体的相对位置与运动。基于 OpenCV.js 和 ArUco 标记，无需安装软件或上传摄像头图像。

## 开始使用

打开部署后的 GitHub Pages 网址。首次发布成功后，可以在仓库的 **Settings → Pages → Visit site** 找到网址，也可以在 **Actions → Test and deploy Pages → Deploy website** 中查看部署结果。

1. 点击 **打印标记**。默认 A 为 ID 0、B 为 ID 1，字典为 `DICT_4X4_50`。
2. 按 **100% 原始尺寸**打印，关闭“适合页面”。用尺确认黑色正方形的边长，默认是 **40 mm**。
3. 将 A、B 分别平整粘贴到两个刚性物体上，保留标记四周的白色留边。
4. 点击 **启动摄像头** 并授权，使两个标记同时完整出现在画面中。
5. 点击 **设为基准**，然后移动物体，观察位移和旋转变化。

可先点击 **示例模式**，拖动 B 或调整 X/Y/Z 滑杆体验。示例生成的标记画面也经过真实 OpenCV 检测与位姿计算，不会开启摄像头。

## 功能

- B 相对于 A 的三维位置和中心距离，单位 mm。
- 相对于初始基准的三维位移、分轴位移和旋转角变化。
- 最近 30 秒的位移曲线与 CSV 导出。
- 镜像预览，默认开启，可在画面右上角切换并记住选择。
- 标记打印、SVG 下载、摄像头选择和相机标定参数导入。
- 标记丢失时清空当前读数，并在记录中标明跟踪无效。

坐标以 A 标记为基准：X 向右、Y 向上、Z 向外。镜像只翻转预览和检测框；检测、坐标、基准和导出数据使用摄像头原始图像，切换镜像无需重新归零。

标记应固定在真正需要测量的刚性部件上。页面跟踪的是标记中心，而不是物体任意选定的接触点。

## 测量精度与相机标定

未导入标定参数时，程序使用水平视场角 60°、零畸变估算内参，**毫米读数是估算值**。本工具尚未验证实物测量达到 3 mm 精度；合成画面的测试结果不能代替实物精度验证。

点击右上角齿轮，导入当前相机的标定 JSON，格式如下：

```json
{
  "width": 1280,
  "height": 720,
  "fx": 1100,
  "fy": 1100,
  "cx": 640,
  "cy": 360,
  "distortion": [0, 0, 0, 0, 0]
}
```

以上数值**仅用于说明格式**，必须替换为实际标定结果。不同摄像头分别标定；切换镜头、变焦或画面裁切后应重新确认标定。输入分辨率与采集画面的宽高比需一致。

进行正式测量前，建议先做静止噪声测试、将两个标记固定在同一刚体上整体移动，以及用独立测量过的位移台验证已知位移。

## 数据与隐私

- 摄像头图像、标记检测与测量在使用者的浏览器本地完成，工具没有上传图像或测量结果的接口。
- 相机参数、标记边长和镜像偏好保存在该浏览器的本地存储中，组员之间不会自动共享。
- 基准和测量记录保存在内存中。刷新页面、切换来源或修改测量参数会清除基准和记录，请先导出。
- CSV 包含时间、来源、标定状态、跟踪有效性、相对位置、位移和旋转。`tracking_valid=false` 的行没有位置或位移读数。
- 记录最多保留 36,000 条，约一小时；曲线显示最近 30 秒。
- 页面字体从 Google Fonts 请求；字体不可用时自动回退到系统字体。OpenCV.js 随网站一起提供，不需要从外部 CDN 加载。

请勿将实验记录、参与者图片、访问令牌或实际相机标定数据提交到公开仓库。

## GitHub Pages 部署

本项目为静态网页，发布目录为 `dist/`，无需安装 npm 依赖或构建。

仓库所有者首次部署时：

1. 将本项目推送到公开仓库的 `main` 分支。
2. 在 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 打开 **Actions → Test and deploy Pages → Run workflow**，选择 `main` 并运行。
4. 等待部署成功，将 Pages 网址发给组员。使用网页无需 GitHub 账号。

之后每次推送到 `main` 都会先检查语法、运行测量引擎测试，再自动部署。Pull Request 只运行检查，不发布网页。

参考：[GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 本地运行

安装 Python 3 后，在项目根目录运行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

打开 <http://127.0.0.1:8765>。摄像头需要 HTTPS 或 localhost；直接双击 HTML 文件、使用普通 HTTP 局域网地址或某些应用内浏览器时可能无法授权。建议用 Chrome、Edge 或 Safari 的独立浏览器窗口打开。

## 开发与检查

使用 Node.js 24：

```sh
node --check dist/app.js
node --check dist/engine.mjs
node tests/engine.test.mjs
```

测试覆盖相对坐标计算、消除共同刚性运动、已知平移与旋转、合成图像的 ArUco 检测、无标记画面，以及相机参数校验。

```text
dist/
  index.html        页面
  style.css         样式，背景 #F1F1F1
  app.js            摄像头、预览、交互、打印与 CSV
  engine.mjs        OpenCV 检测、位姿与坐标计算
  vendor/           固定版本 OpenCV.js 与许可证
examples/           可打印的默认标记
tests/              测量引擎测试
.github/workflows/  自动检查与 Pages 部署
```

## 许可证

项目采用 [Apache-2.0](LICENSE)。OpenCV 与 `@techstark/opencv-js@4.12.0-release.1` 的来源和许可证见 [NOTICE](NOTICE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
