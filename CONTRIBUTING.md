# 协作开发

1. 从 `main` 新建分支，完成修改后提交 Pull Request。
2. 在 Node.js 24 下先运行 `node scripts/prepare-opencv.mjs`，再运行 README 中的语法检查与 `node tests/engine.test.mjs`。
3. 修改界面或摄像头逻辑时，在浏览器验证示例模式、基准设置、镜像开关及 CSV 导出。
4. 修改坐标或位姿计算时，增加能覆盖实际行为的测试，并记录实物验证方法。
5. Pull Request 说明修改目的、验证结果和影响。合并到 `main` 后由 GitHub Actions 自动部署。

请只提交通用工具源码与合成测试素材。实验数据、参与者图像、凭据与实际相机标定参数不属于公开源码。
