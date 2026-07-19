# 汉字笔顺

基于常用规范字形笔顺数据的网页练习工具：支持输入词语、教育部《通用规范汉字表》快速选字、田字格笔顺动画、拼音与朗读。

## 功能

- **笔顺动画**：田字格 + 灰色底稿，逐笔演示
- **搜索输入**：输入汉字 / 词语后展示并播放
- **汉字表**：一级 / 二级 / 三级字表浏览、筛选、字序跳转、多选
- **读音**：格子上显示拼音；多音字标「多」，完整读音见提示与详情区
- **朗读**：开发环境下通过本地代理播放较慢女声 TTS
- **控制**：播放 / 循环 / 停止（状态驱动）；田字格显示开关；速度调节
- **移动端**：底部吸顶控制条，触控友好

## 技术栈

- [Vite](https://vitejs.dev/) + TypeScript
- [Hanzi Writer](https://hanziwriter.org/)（笔顺动画）
- [pinyin-pro](https://github.com/zh-lx/pinyin-pro)（拼音）

## 快速开始

需要 Node.js 18+。

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址（默认 `http://localhost:5173/`）。

```bash
npm run build    # 产出到 dist/
npm run preview  # 预览构建结果（含 TTS 代理）
npm start        # 生产静态服务 + /api/tts（需先 build）
```

## Docker

镜像支持 **linux/amd64（x86_64）** 与 **linux/arm64（Apple Silicon / ARM 服务器）**。容器内提供静态资源与朗读代理。

### 本地运行（当前架构）

```bash
docker compose up --build
```

浏览器打开 `http://localhost:8080`。

或：

```bash
docker build -t hanzi-practice:local .
docker run --rm -p 8080:8080 hanzi-practice:local
```

### 多架构构建（x86 + ARM）

需启用 Buildx：

```bash
docker buildx create --name multiarch --use 2>/dev/null || docker buildx use multiarch

# 推送到镜像仓库（多平台需 --push；--load 只能装载单一平台）
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --provenance=false --sbom=false \
  -t ghcr.io/<owner>/hanzi-practice:latest \
  --push .
```

仅构建当前机器架构并载入本地：

```bash
docker buildx build --platform linux/arm64 -t hanzi-practice:local --load .
# 或 linux/amd64
```

推送到 `main` / 版本标签时，GitHub Actions（`.github/workflows/docker.yml`）会自动构建并推送双架构镜像到 GHCR。

## 数据来源与说明

| 内容 | 来源 |
| --- | --- |
| 笔顺动画数据 | [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)，经 Hanzi Writer 呈现 |
| 汉字表 | 教育部、国家语委《[通用规范汉字表](http://www.moe.gov.cn/jyb_sjzl/ziliao/A19/201306/t20130601_186002.html)》（2013），本地数据见 `public/data/moe-characters.json` |
| 拼音 | pinyin-pro |
| 朗读 | 开发 / 预览时由 Vite 插件代理百度翻译 TTS；失败时回退有道单字发音 |

本项目仅供学习使用。字形笔顺以开源笔顺库为准，与官方动画网站可能存在个别差异。

## 项目结构

```
├── public/data/moe-characters.json  # 通用规范汉字表（一/二/三级）
├── src/
│   ├── main.ts        # 页面与播放逻辑
│   ├── charTable.ts   # 汉字表快速选择
│   ├── speak.ts       # 朗读
│   ├── presets.ts     # 快捷示例词
│   └── style.css
├── server.mjs         # 生产静态服务 + TTS 代理
├── Dockerfile         # 多架构镜像（amd64 / arm64）
├── docker-compose.yml
├── vite.config.ts     # 开发/预览 TTS 代理 (/api/tts)
└── index.html
```

## 部署注意

- **推荐**：使用 Docker / `npm start`，朗读代理可用。
- 静态托管（如 GitHub Pages）可正常使用笔顺、拼音与汉字表；**朗读**无 `/api/tts` 时会走有道单字兜底，整句效果可能受限。

## License

建议在仓库根目录补充 `LICENSE`（例如 MIT）后再公开。

第三方数据与库请遵循各自许可：

- Hanzi Writer / Make Me a Hanzi：见其仓库说明（含文鼎相关授权约束）
- 《通用规范汉字表》：国家标准公开数据，引用时请注明出处
