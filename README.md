# 信息网络化离线题库

在线访问：<https://li-mo66.github.io/network-quiz/>

也可双击 `index.html` 离线使用，不需要联网或安装服务器。练习成绩和错题本保存在当前浏览器的本地存储中。

题库内容来自上级目录的 DOCX 文件。更换 Word 题库后，在上级目录执行：

```powershell
python .\network-quiz\tools\build_bank.py
```

数据完整性和页面流程验收：

```powershell
node .\network-quiz\tools\ui_smoke_test.mjs
```
