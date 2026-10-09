# 小小學習樂園

給小朋友的學習網站,純 HTML / CSS / JavaScript,不需要安裝任何東西,也沒有後端。

| 頁面 | 內容 |
| --- | --- |
| `poems.html` | 唐詩三百首:點一首就唸給你聽、逐句高亮、**最常播放 Top 10**、搜尋(詩名/詩人/詩句)、依體裁篩選、朗讀速度 |
| `abc.html` | 26 個字母卡片(圖片 + 單字 + 聲音)、「從 A 唸到 Z」、2 種小遊戲、YouTube 影片 |
| `numbers.html` | 1~100:一邊數一邊亮起圖案、中文/英文切換、注音、好記的小提示、2 種小遊戲、YouTube 影片 |

## 怎麼打開

**建議:雙擊 `start.bat`**。它會用 Windows 內建的 PowerShell 開一個只在本機的小伺服器,並打開瀏覽器(關掉黑色視窗就停止)。
不用安裝 Python 或 Node。

也可以直接雙擊 `index.html` 打開,唐詩和字母數字都能用,**但 YouTube 會拒絕在這種方式打開的頁面裡嵌入影片**,
所以點影片時會改成在新分頁用 YouTube 開啟。

要放到網路上(例如 GitHub Pages),整個資料夾原封不動上傳即可,所有路徑都是相對路徑。

## 聲音是怎麼來的

用瀏覽器內建的語音朗讀(Web Speech API),不需要準備任何音檔。缺點是**聲音品質和有哪些語音取決於裝置**:

- 手機、平板、Mac:通常有現成的中英文語音。
- Windows:中文語音通常有;**英文語音要裝了英文語言包才有**(「設定 → 時間與語言 → 語音 → 新增語音 → English (United States)」),
  Chrome 或 Edge 連上網路時通常也會多出線上語音可選。
- 找不到語音時,頁面上會出現黃色提示。

(開發時在內建預覽瀏覽器測試,它只有 3 個中文語音、沒有英文語音,所以英文發音品質沒有在這裡驗證過。)

## 播放排行(Top 10)

記錄在**這台裝置的這個瀏覽器**(localStorage),所以每個小朋友用自己的平板/手機就有自己的排行,不會互相影響。
換瀏覽器、換裝置、清除瀏覽資料,排行就會歸零。頁面上有「清除排行紀錄」按鈕。

## 換 YouTube 影片

- **最簡單**:在 ABC 或 123 頁最下面的「家長區」貼上 YouTube 網址,按新增(只存在這個瀏覽器)。
- **永久換掉預設清單**:編輯 `data/videos.js`,把 `id` 換成影片網址 `watch?v=` 後面那 11 個字元。

預設的 9 支影片(Super Simple Songs、Pinkfong、貝貝彬)都已確認存在且允許嵌入;但頻道主可以隨時下架或關閉嵌入,
如果哪支突然打不開,換掉它就好。

## 詩文資料

`data/poems.js` 來自 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry) 開源專案(MIT)的 `蒙學/tangshisanbaishou.json`,
共 320 筆。已清除原始資料夾帶的校勘註記(例如「(明年 一作:年年)」),把「爲」「裏」「着」統一成「為」「裡」「著」,
並檢查過五絕/七絕/五律/七律的字數(20/28/40/56)都正確。

**每首詩的 `id` 不要改**,播放排行是用 `id` 記錄的。

## 檔案結構

```
index.html  poems.html  abc.html  numbers.html
css/style.css          共用樣式
js/common.js           語音、影片區、小遊戲、頁首
js/poems.js  js/abc.js  js/numbers.js
data/poems.js          唐詩資料
data/videos.js         YouTube 影片清單
serve.ps1  start.bat   本機預覽伺服器
```
