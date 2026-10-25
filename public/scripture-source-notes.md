# Prayer Box prototype: Scripture source and edition notes

Checked: October 24, 2026.

## Review status

The site’s Trinitarian foundation is a confirmed product requirement. The exact public About-page wording, editorial explanations, and final Bible translation/edition await founder approval. The local prototype uses the **World English Bible, updated U.S.-spelling text, 66-book edition (`engwebp`)** as a clearly labeled proposed edition. It does not claim that the founder approved this translation or that a human theological review is complete.

## Publisher and reuse

- [Official World English Bible edition overview](https://worldenglish.bible/).
- [Primary engwebp publisher reuse statement](https://ebible.org/engwebp/copyright.htm).
- [Publisher’s engwebp collection](https://ebible.org/engwebp/).

The publisher dedicates the Bible text to the public domain and permits copying and redistribution. “World English Bible” is a trademark used here to identify faithful text. The reuse statement asks that altered wording not be labeled World English Bible. This prototype normalizes HTML whitespace and renders verse numbers separately; it preserves the selected Bible wording and punctuation. Scripture text is not rewritten to match a product policy.

The edition overview and reuse statement were opened and inspected from the publisher during this implementation. The engwebp reuse page describes this collection as the updated WEB with the 66-book protocanon. Its footer says the HTML was generated October 22, 2026 from source files dated October 22, 2026; that footer is source metadata, not a claim that this prototype is an official publisher release.

## Verification performed

The implementation downloaded the primary publisher HTML chapters with a normal browser user-agent, parsed their actual verse markers, selected only the Appendix A verse ranges, and retained the publisher’s textual notes on selected verses. All forty selected passages were printed and read back in two bounded batches. Each required verse exists and contains text. No whole third-party page is embedded. Nonconsecutive selections are separate labeled segments: **John 1:1–3** and **John 1:14**; **Acts 12:5** and **Acts 12:12**.

The collection contains **40 entries in six themes and 137 selected verse occurrences**. Matthew 6:9–13 is also rendered in the separate Lord’s Prayer guide. Verse occurrences are counted within each selection; overlapping passages are intentionally repeated where the brief requests them.

The full Matthew 6:9–13 quotation includes the publisher’s wording “Pray like this:” and the concluding praise. Its verse 13 note is preserved exactly:

> NU omits “For yours is the Kingdom, the power, and the glory forever. Amen.”

The six-movement guide and the separate suggested “In the name of Jesus Christ, amen” closing are editorial content outside the Scripture quotation. The About page does not imply that those closing words are required or that the prayer promises a particular outcome.

All data are bundled locally in `src/data/scripture.ts`. The About page makes no runtime Bible API or network fetch. Publisher links are optional external source/context links. This is source/selection verification, not a completed human theological review or final publication approval.

## Appendix A coverage

| Entry | Reference | Selected verses | Primary publisher source |
| --- | --- | --- | --- |
| 01 | Matthew 28:19 | 1 | [Chapter](https://ebible.org/engwebp/MAT28.htm) |
| 02 | Matthew 3:16–17 | 2 | [Chapter](https://ebible.org/engwebp/MAT03.htm) |
| 03 | John 1:1–3, 14 | 4 | [Chapter](https://ebible.org/engwebp/JHN01.htm) |
| 04 | John 14:16–17 | 2 | [Chapter](https://ebible.org/engwebp/JHN14.htm) |
| 05 | Ephesians 2:18 | 1 | [Chapter](https://ebible.org/engwebp/EPH02.htm) |
| 06 | 2 Corinthians 13:14 | 1 | [Chapter](https://ebible.org/engwebp/2CO13.htm) |
| 07 | John 14:13–14 | 2 | [Chapter](https://ebible.org/engwebp/JHN14.htm) |
| 08 | John 15:7 | 1 | [Chapter](https://ebible.org/engwebp/JHN15.htm) |
| 09 | John 15:16 | 1 | [Chapter](https://ebible.org/engwebp/JHN15.htm) |
| 10 | John 16:23–27 | 5 | [Chapter](https://ebible.org/engwebp/JHN16.htm) |
| 11 | 1 John 5:14–15 | 2 | [Chapter](https://ebible.org/engwebp/1JN05.htm) |
| 12 | James 1:5 | 1 | [Chapter](https://ebible.org/engwebp/JAS01.htm) |
| 13 | James 4:3 | 1 | [Chapter](https://ebible.org/engwebp/JAS04.htm) |
| 14 | James 5:13–16 | 4 | [Chapter](https://ebible.org/engwebp/JAS05.htm) |
| 15 | James 5:17–18 | 2 | [Chapter](https://ebible.org/engwebp/JAS05.htm) |
| 16 | Ephesians 6:18–20 | 3 | [Chapter](https://ebible.org/engwebp/EPH06.htm) |
| 17 | Romans 15:30–32 | 3 | [Chapter](https://ebible.org/engwebp/ROM15.htm) |
| 18 | 1 Timothy 2:1–6 | 6 | [Chapter](https://ebible.org/engwebp/1TI02.htm) |
| 19 | 1 Thessalonians 5:16–18 | 3 | [Chapter](https://ebible.org/engwebp/1TH05.htm) |
| 20 | 1 Thessalonians 5:25 | 1 | [Chapter](https://ebible.org/engwebp/1TH05.htm) |
| 21 | 2 Thessalonians 3:1–2 | 2 | [Chapter](https://ebible.org/engwebp/2TH03.htm) |
| 22 | Philippians 1:3–11 | 9 | [Chapter](https://ebible.org/engwebp/PHP01.htm) |
| 23 | Philippians 4:6–7 | 2 | [Chapter](https://ebible.org/engwebp/PHP04.htm) |
| 24 | Colossians 1:9–12 | 4 | [Chapter](https://ebible.org/engwebp/COL01.htm) |
| 25 | Colossians 4:2–4 | 3 | [Chapter](https://ebible.org/engwebp/COL04.htm) |
| 26 | Colossians 4:12 | 1 | [Chapter](https://ebible.org/engwebp/COL04.htm) |
| 27 | 2 Corinthians 1:3–11 | 9 | [Chapter](https://ebible.org/engwebp/2CO01.htm) |
| 28 | Matthew 6:5–13 | 9 | [Chapter](https://ebible.org/engwebp/MAT06.htm) |
| 29 | Matthew 5:44 | 1 | [Chapter](https://ebible.org/engwebp/MAT05.htm) |
| 30 | Luke 11:1–13 | 13 | [Chapter](https://ebible.org/engwebp/LUK11.htm) |
| 31 | Luke 18:1–8 | 8 | [Chapter](https://ebible.org/engwebp/LUK18.htm) |
| 32 | Acts 1:14 | 1 | [Chapter](https://ebible.org/engwebp/ACT01.htm) |
| 33 | Acts 12:5, 12 | 2 | [Chapter](https://ebible.org/engwebp/ACT12.htm) |
| 34 | John 17:20–23 | 4 | [Chapter](https://ebible.org/engwebp/JHN17.htm) |
| 35 | Romans 8:26–27 | 2 | [Chapter](https://ebible.org/engwebp/ROM08.htm) |
| 36 | Hebrews 4:14–16 | 3 | [Chapter](https://ebible.org/engwebp/HEB04.htm) |
| 37 | Luke 22:39–46 | 8 | [Chapter](https://ebible.org/engwebp/LUK22.htm) |
| 38 | 2 Corinthians 12:7–10 | 4 | [Chapter](https://ebible.org/engwebp/2CO12.htm) |
| 39 | 1 Thessalonians 5:11 | 1 | [Chapter](https://ebible.org/engwebp/1TH05.htm) |
| 40 | Psalm 66:16–20 | 5 | [Chapter](https://ebible.org/engwebp/PSA066.htm) |

## Supplemental context inspected

- [Luke 4:40](https://ebible.org/engwebp/LUK04.htm#V40): Jesus laying hands on sick people.
- [Acts 28:8](https://ebible.org/engwebp/ACT28.htm#V8): Paul praying and laying hands on Publius’s father.
- [James 5:13–16](https://ebible.org/engwebp/JAS05.htm#V13): personal prayer, the elders’ prayer, anointing, confession, and mutual care. It is not mislabeled as an explicit laying-on-of-hands passage.
- [Hebrews 10:24–25](https://ebible.org/engwebp/HEB10.htm#V24): gathering and mutual encouragement.
- [2 Peter 3:10–13](https://ebible.org/engwebp/2PE03.htm#V10) and [Revelation 21:1–5](https://ebible.org/engwebp/REV21.htm#V1): future hope without an asserted end-times timetable.
- [James 1:13](https://ebible.org/engwebp/JAS01.htm#V13): God does not entice people to evil.
- [Acts 7:59–60](https://ebible.org/engwebp/ACT07.htm#V59): Stephen addresses the Lord Jesus.
- [Athanasian Creed, Reformed Church in America](https://www.rca.org/about/theology/creeds-and-confessions/the-athanasian-creed/): core divine unity and distinction of persons. The About statement remains proposed site copy; the prototype does not reproduce the creed or adopt unrelated denominational requirements.

Consent, safeguarding, product access, and moderation policies are site practices, not claims of verbatim biblical commands.

## Primary source snapshots

The following SHA-256 values identify the downloaded primary HTML chapter content used for the check. The temporary raw HTML files are not app assets, and a future publisher update may change a hash. Hashes identify snapshots; they do not independently prove theological accuracy.

| Primary chapter | SHA-256 of downloaded UTF-8 HTML |
| --- | --- |
| [1JN05.htm](https://ebible.org/engwebp/1JN05.htm) | `8e497a11a641c0f298bb57c3b8dc260b4a022a614f7fc566d617d210738b5488` |
| [1TH05.htm](https://ebible.org/engwebp/1TH05.htm) | `f857407e8d07f46deaf5175c4af29b6675435169fcf713f36afaa5cc8d678194` |
| [1TI02.htm](https://ebible.org/engwebp/1TI02.htm) | `1971f5100c3ac9593c97514f8426b3e65c066a48e02fcf9a79f6645ac81b001e` |
| [2CO01.htm](https://ebible.org/engwebp/2CO01.htm) | `1275d9955796ca117cb0229769f07bf9d9a7aab8c60e1760ee295b50b9595889` |
| [2CO12.htm](https://ebible.org/engwebp/2CO12.htm) | `4cd9a8ef1e190a2543600c2076e47849c485a195cc388d7eb5cb1f4edbe47600` |
| [2CO13.htm](https://ebible.org/engwebp/2CO13.htm) | `d5e112ce54a1ba16e33a03674087347e5f960d1f2d4225bf3c028b8e221cfb36` |
| [2PE03.htm](https://ebible.org/engwebp/2PE03.htm) | `128c411e835d3a5c04625ad983b1d5ddb3d58a2e724a919387832f228c97d951` |
| [2TH03.htm](https://ebible.org/engwebp/2TH03.htm) | `1e5a3aa3b851bccdf54072fd3cea7b89716beea5b231555d7f6cf8231778b709` |
| [ACT01.htm](https://ebible.org/engwebp/ACT01.htm) | `446647aef3b2785229b261219142326ce7bb2cfaf61928905147222639b62e1f` |
| [ACT07.htm](https://ebible.org/engwebp/ACT07.htm) | `9d188066d4af371151d7fa8b322f61a5993b2e67c837ca35c33180c9bf2cdaba` |
| [ACT12.htm](https://ebible.org/engwebp/ACT12.htm) | `44311690763c99cb7e5a2ce1557dabf7ce895d679e6cefcee4078c6a7a979cbf` |
| [ACT28.htm](https://ebible.org/engwebp/ACT28.htm) | `378546dc11af998389423880dc02494a4110c8f9082ca291cfffc31917b7d571` |
| [COL01.htm](https://ebible.org/engwebp/COL01.htm) | `d30852f22fe526759dc9d0f30edb5387cc80f94d2101f2ded77d6c5cfb32a424` |
| [COL04.htm](https://ebible.org/engwebp/COL04.htm) | `fedb880173e52e7768a345b6c8539f7ee400f02391031afe0e567cbd9e1aa567` |
| [EPH02.htm](https://ebible.org/engwebp/EPH02.htm) | `91f35ab14533700df8a14023e0703388dc6d57cdda0f574a5600e28254578f9b` |
| [EPH06.htm](https://ebible.org/engwebp/EPH06.htm) | `cd5c4c6d460c2754577c619b5c40b8ce5468ca3628e4f3d5cd792e963558b5a4` |
| [HEB04.htm](https://ebible.org/engwebp/HEB04.htm) | `01b18f2aa42d85ed7a98932f6d166c27f24e634e2ffdd062f77a9e2f87fad5d3` |
| [HEB10.htm](https://ebible.org/engwebp/HEB10.htm) | `eec640eb9fd43ca0419ec8fb4813e42be88b28574fab087f51f03fef57888a7b` |
| [JAS01.htm](https://ebible.org/engwebp/JAS01.htm) | `ff87b2c015caa2847f79e9ace9872446ca105a7547f8a9e35d0a4d268fc08fb6` |
| [JAS04.htm](https://ebible.org/engwebp/JAS04.htm) | `e0a1f1c47a55d81d25869926a452347a1a31a8eea8dbded751a0f6b158a501c2` |
| [JAS05.htm](https://ebible.org/engwebp/JAS05.htm) | `25c8c5526363b1793b2c77023cb356b1f2234d2641f1821cc4f7f9a7f8b941af` |
| [JHN01.htm](https://ebible.org/engwebp/JHN01.htm) | `fec7a5848394d24d863774716511bea080b0e40122597aecaa120cf97ce86728` |
| [JHN14.htm](https://ebible.org/engwebp/JHN14.htm) | `0d55a364895a33bc8d48b2638e1e73296811e13de038ae49aba44651f5d8dc6e` |
| [JHN15.htm](https://ebible.org/engwebp/JHN15.htm) | `9249364296530fda0b816881312d60ee68cd450148f1cdc83fadc88816b790ce` |
| [JHN16.htm](https://ebible.org/engwebp/JHN16.htm) | `0fd6b78922ffaaef4ed0e04bfd06440af378090b90f596f0dc04b536d7d1d6e2` |
| [JHN17.htm](https://ebible.org/engwebp/JHN17.htm) | `17e344ce1cf1450ed92135f45c674bc974b779d902bc46000902f15f8a023abb` |
| [LUK04.htm](https://ebible.org/engwebp/LUK04.htm) | `34920773e9ec1f0a0fa9509b08ab9a0f41b8074b4fdbcdbf3fb6e7bdff4bb37a` |
| [LUK11.htm](https://ebible.org/engwebp/LUK11.htm) | `e853d25d202bd13a2fca1e52088cc5e953b4dc96422a0d8289060afbd2f130a4` |
| [LUK18.htm](https://ebible.org/engwebp/LUK18.htm) | `85f1cfa160b1953be9a7d50255863b8331ab8bbc7afe8282192aad3ffee7113e` |
| [LUK22.htm](https://ebible.org/engwebp/LUK22.htm) | `ba8f496f99007fb22f4f93c1d9c6fc8c93e9abc5098ff949e9ca71ece7fa4d9f` |
| [MAT03.htm](https://ebible.org/engwebp/MAT03.htm) | `dcf82565de32c75ec2fe2b48a7dffc4f2f4c80cb6d43a4aff763261e54f8a5ef` |
| [MAT05.htm](https://ebible.org/engwebp/MAT05.htm) | `e597eb7fe77d45b6c82b7f44e897dfae25017d1b18fef786285781dc82c464c5` |
| [MAT06.htm](https://ebible.org/engwebp/MAT06.htm) | `777bde0de4c258a9d7e62cddd2905e11a2bf6de72814c740d234ce71295b3504` |
| [MAT28.htm](https://ebible.org/engwebp/MAT28.htm) | `b68142a143ce073846eed96c9588221acff698012e04eba83c47ac5960329581` |
| [PHP01.htm](https://ebible.org/engwebp/PHP01.htm) | `484b4d23423000b17f20a8a95ff2f23c316431deda5dcdfbc602b2673869ef64` |
| [PHP04.htm](https://ebible.org/engwebp/PHP04.htm) | `429ccedb5991ba6216f846fc707e0039f3f1e36ab3bee34b8223b3f09505a929` |
| [PSA066.htm](https://ebible.org/engwebp/PSA066.htm) | `114234c55c7cc942817bda550a19c00d89631359d62f1c4a82930712d53fd0dd` |
| [REV21.htm](https://ebible.org/engwebp/REV21.htm) | `43627f7bdcc43a684f524fa6e7108c7ffec811c7afef05518506531f38fad0ad` |
| [ROM08.htm](https://ebible.org/engwebp/ROM08.htm) | `934f760d30863451a035a94b8b43ec1bf7b2fc5f31ddde97548632e5a11e8b58` |
| [ROM15.htm](https://ebible.org/engwebp/ROM15.htm) | `c454c004233795eb0164c2f9f462c7bb8b6cccaf8aba97ef6b5c2d08d5107672` |
