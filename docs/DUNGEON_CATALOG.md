# 全客户端副本资料

御契桌面版在「阵容库 → 全客户端副本与规则」按需读取本地资料。打包前将生成的目录放在 `data/dungeon-catalog`，即可随桌面版打开。运行时也可以在这个面板选择已有的副本资料目录。

《阴阳师》2.8.87 的 `0.0.816` 资源包中，已从 3,850 个客户端配置模块读取 3,846 张表，共 659,344 条记录。主要资料包括 17,617 条通用 PvE 关卡、17,563 条战斗编组、491 条场景站位、217 条通用战斗模式以及御魂、觉醒、秘闻、阴阳寮狭间暗域、活动组队等玩法专表。表项保留来源模块和校验值，读取资料表时核对压缩文件的 SHA-256。

`__init__`、`bindict_proxy`、`deco_skin_index` 和 `skin_bg_index` 的静态记录未提取。玩法筛选根据客户端表名归类，可在全部玩法中搜索每张表。客户端表含历史活动和内部记录，区服开放、入场资格和服务器结算须以实机为准。静态表可供核对规则与输入，100% 通关和动画耗时仍需战斗回放及可达分支证据。

## 御魂神罚规则核对

资源 `0.0.816` 的御魂神罚配置使用副本 ID 102、阵容码副本 ID 1001001、战斗场景 469055。离线调用同版本 `RuneFbEngine` 初始化得到 3 波敌人，我方初始鬼火 3，敌方初始鬼火 2。原版 `_adjustMonsterAttr` 在三波分别给敌方攻击加成率累加 2.0、2.4、2.2，其余四项配置为 0，随后以调整后的最大生命初始化当前生命。对应模块的 marshal SHA-256 为 `bde51d4ceee8fb08c0b5e265eb4bb9663d5a6efe207517b9d16b0dc968749f24`。

使用同版本原版模型资源，分别调用三个波次的生成函数并读取新建敌人的生命、速度、攻击和防御。9 个敌人均生成成功，其中第三波大蛇神开场速度为 135，生命约 800,001，攻击 6,858.24，防御 580。御契在魂王波次中显示这些开场属性。该试验覆盖生成阶段，完整对局与各波切换仍待核验。

动画走客户端模型动作和事件。客户端同一条动作命令接收动作列表时累加列表内时长，多个实体实际是否重叠取决于播放事件及战斗推进时序。模型文件时长可以核对单段动作，需要同一对局的完整事件时间轴才能据此核验整局耗时。对应 `entities/BattleRender` 模块的 marshal SHA-256 为 `97cb2740eacbad47e7f44dd6dbf2033b76bb18af6f16721671f6fa4e8bb07a21`。

## 从本机解包资源生成

使用「阴阳师解包」导出的安装包及云资源，保留 `raw/extra/thd`、`raw/extra/script3.zip` 和 `raw/extra/update.ini`。从「阴阳师培育」的本地分析项目指定 `tools` 和含已验证 opcode 映射的目录。提取工具需要 CPython 3.11.6 及该分析项目的依赖。若原生库校验值与 opcode 证据不符，须使用该版本对应的证据。

```powershell
& $YuqiPython tools/extract-dungeon-catalog.py $YuqiSnapshot --game-tools $YuqiGameTools --opcode-proof $YuqiOpcodeProof --apk-version 2.8.87 --tables tmp/dungeon-tables --output data/dungeon-catalog
```

已提取的 JSON 表也可以直接打包。

```powershell
python tools/build_dungeon_catalog.py tmp/dungeon-tables data/dungeon-catalog
```

运行提取命令时可追加 `--battle-index output/battle-modules.json`，为本版本的 6,942 个战斗模块记录资源路径、偏移和校验值。该索引可定位同一版本的模块，客户端原始文件仍位于解包目录。

## 复跑原版引擎的合成对局

提取时追加 `--script-index tmp/active-scripts.json`，让原版引擎使用从同一资源包提取的脚本和模型。通过下列命令运行晴明与两名帚神的合成对局。

```powershell
$env:PYTHONHASHSEED = '0'
& $YuqiPython tools/verify-rune-runtime.py --snapshot $YuqiSnapshot --game-tools $YuqiGameTools --opcode-proof $YuqiOpcodeProof --script-index tmp/active-scripts.json --output tmp/rune-runtime.json
```

脚本会检查原生库和脚本校验值、禁止网络连接，输出阶段、已过波次、随机调用计数和战斗记录。Windows 宿主使用从相同资源解出的静态字典来适配原版数据表查找。此夹具用于验证结算链路，使用合成角色数据，未测客户端渲染时间或可达随机分支。

本机复跑依次经过加载、准备、召唤、选式神、战斗和结算。合成阵容两回合后在第一波落败。2026-11-26 的回放包含 830 行，全部 39 条播放动作指令均找到对应的模型动画长度。按回放时间和模型长度计算，不同实体的动作窗口共重叠 8,229.01 毫秒，同时最多 4 个实体。

`animationSync` 记录客户端播放指令的名义同步窗口，包含动画别名及多段动作的时长。排队指令单独计数，缺少模型或动画时列出未解析的记录。数值包括待机和受击动作请求，尚未测量画面帧、播放速率、取消动作后的实际时长或结算界面计时。排名仍需用实机计时校准。

`python tools/rune_replay.py tmp/rune-runtime.json --output tmp/rune-animation.json` 可按报告中的 SHA-256 重新校验回放和模型，再计算这些窗口。

### 复跑选定库存

在上面的命令末尾加 `--team tmp/selected-team.json`，即可将选定库存交给原版引擎。文件的 `onmyoji` 是明确指定的阴阳师配置，包含 `heroId`、`level`、`star`、`awake` 与 `skinfo`。`members` 数组里每项包含 `instanceId`、平安志原始式神 `hero` 和选定御魂记录数组 `souls`。可以少于五名式神，或保留空余御魂位置。同一队内实例和御魂槽位不得重复使用。

式神培养信息使用原版 `HeroData`。御魂导出值映射为 `EquipAttrCalc` 的属性名，套装效果由原版按套装 ID 处理。首领御魂的固定值通过导出属性计入一次。回放用临时别名代替库存实例 ID。

本机已用一名真实账号式神、六件真实御魂及测试晴明复跑，三回合后在第一波结算为失败。回放有 733 行，38 条播放动作的模型时长全部解析。此入口使用明确选定的配置，尚未接入阵容库的自动计算、契灵、锁定技能和随机分支验证。
