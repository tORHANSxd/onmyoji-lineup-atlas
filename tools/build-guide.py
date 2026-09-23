"""Build the illustrated 0.9.3 guide from real, synthetic-profile screenshots.

Run with Python, reportlab, Pillow and pypdf. Capture first with:
    node_modules/.bin/electron tools/capture-guide.cjs
"""
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf/Yuqi-Guide-0.9.3.pdf"
SHOTS = ROOT / "docs/images/guide-v093"
MANIFEST = json.loads((SHOTS / "manifest.json").read_text(encoding="utf-8"))
assert MANIFEST["version"] == "0.9.3" and MANIFEST["synthetic"]
assert MANIFEST["realRenderer"] and MANIFEST["noPrivateProfileRead"]
assert MANIFEST["noGameConnection"] and not MANIFEST["errors"]
IMAGES = {item["name"]: item for item in MANIFEST["shots"]}
RELEASE = "https://github.com/tORHANSxd/onmyoji-lineup-atlas/releases/tag/v0.9.3"
W, H = A4
M = 36
CW = W - M * 2
INK = colors.HexColor("#332f25")
MUTED = colors.HexColor("#756b57")
GOLD = colors.HexColor("#99712d")
PAPER = colors.HexColor("#f5f0e5")
WHITE = colors.HexColor("#fffdf8")
LINE = colors.HexColor("#d9c8aa")
TINT = colors.HexColor("#eae0cc")
RED = colors.HexColor("#9a4430")
FONT = "Guide"
BOLD = "GuideBold"
pdfmetrics.registerFont(TTFont(FONT, "C:/Windows/Fonts/msyh.ttc"))
pdfmetrics.registerFont(TTFont(BOLD, "C:/Windows/Fonts/msyhbd.ttc"))
pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=BOLD)


PAGES = [
    dict(kind="cover", title="御契 · 使用指南", section="开始使用"),
    dict(kind="contents", title="从这里开始", section="开始使用"),
    dict(kind="install", title="下载、安装与升级", section="开始使用"),
    dict(title="认识首页", section="阵容与库存", shot="01-home",
         intro="先选择库存账号，再按副本找到想用的阵容。无需登录游戏，也能浏览本地已解析内容。",
         steps=[("切换工作页面", "左侧依次进入阵容库、阵容码查看、阵容制作器、我的账号、阵容库管理，以及来源与覆盖。"),
                ("确认当前库存", "右上角账号决定本次差距核对使用哪份库存。这里的库存账号与扫码登录角色互不替代。"),
                ("按用途进入", "点击日常、御魂、契灵等分类继续缩小范围；“目标阵容”集中显示当前库存账号的目标。")],
         note="截图中的“教程库存”、角色与御魂均为合成示例；页面数量随内置资料和个人导入内容变化。"),
    dict(title="查找、筛选与排序", section="阵容与库存", shot="02-filter", figure_max=290,
         intro="先缩小结果，再查看详情或精算，处理大量阵容时更省时间。",
         steps=[("搜索你记得的信息", "搜索框支持阵容名称、式神名和阵容码；“包含式神”可以连续添加多个条件。"),
                ("展开“更多筛选”", "按分类、子类、副本、来源与解析状态筛选。可结合差距条件，查看当前账号更接近完成的阵容。"),
                ("选择排序方式", "在排序框中选择按账号差距、时间、名称等顺序浏览；条件不合适时点击“重置”。")],
         note="尚未解析或要求不完整的阵容，不应当作已满足条件。先检查其状态，再作配装判断。"),
    dict(title="读懂一套阵容", section="阵容与库存", shot="03-detail", annotate=False,
         intro="阵容详情把成员、技能、御魂与用途放在一起。内容较长时，在详情窗口中向下滚动。",
         steps=[("先看用途和说明", "核对适用副本、作者备注、解析状态及短码。分类是查找入口，具体打法仍以阵容说明为准。"),
                ("逐位检查要求", "第一位是阴阳师或英杰，后续为式神。查看等级、技能、自动施法、套装、主属性和数值范围。"),
                ("按需要继续操作", "使用详情内的复制、管理编辑或制作器入口；只有已取得完整成员配置的阵容才能载入制作器。")],
         note="原始配置字段用于核对数据；日常阅读使用技能名称、真实图标和中文要求。图中为详情上半部分。"),
    dict(title="导入平安志库存", section="阵容与库存", shot="04-inventory",
         intro="在“我的账号”导入平安志 JSON，让软件按实际拥有的式神与御魂核对阵容。",
         steps=[("选择 JSON 文件", "点击“导入平安志 JSON”，选择自己导出的库存文件。导入完成后核对账号名称、服务器及数量。"),
                ("留意“增量合并旧库存”", "此项用于导入时合并资料。库存更新通常应使用新的完整导出；增量资料或不同来源合并后，要核对数量与完整性。"),
                ("检查式神和御魂", "利用搜索、类型筛选和分页查看内容。若导出只含部分数据，缺少的技能或御魂信息不会自动补成已拥有。")],
         note="扫码登录用于查询阵容码和生成官方短码，不会替代平安志库存导入。库存文件包含个人游戏资料，请自行妥善保存。"),
    dict(title="查看库存中的技能", section="阵容与库存", shot="05-inventory-skills", figure_max=320,
         intro="技能卡片显示真实名称与图标，并标明技能位置、等级和官方类型词条。",
         steps=[("对照每个实际式神", "同名的多个式神是不同库存实例。查看各自星级、等级、觉醒状态及技能等级，避免把一只当作两只使用。"),
                ("点击技能看详情", "打开后可查看鬼火消耗、可升级等级与逐级效果；变化技能和官方词条也在详情中展开。"),
                ("区分“没有”与“未知”", "库存未提供的技能信息不能证明达到阵容要求。建议重新导出完整库存，再进行精算。")],
         note="阴阳师、英杰和契灵按全部拥有处理；这不代表默认满等级、满技能或已佩戴任意配置。"),
    dict(title="选择阵容，设为目标", section="阵容与库存", shot="06-targets",
         intro="目标阵容按库存账号分别保存，适合记录接下来要培养、配装或收集的阵容。",
         steps=[("先筛选，再勾选", "逐条勾选，或使用“全选筛选结果”“反选”“全部取消”。全选的范围是当前筛选结果。"),
                ("设为当前账号的目标", "点击“设为目标”；不再需要时点击“移出目标”。切换库存账号后会看到该账号自己的目标。"),
                ("只精算需要的阵容", "点击“精算选中项”，完成后对照成员和御魂差距，不必每次都精算整库。")],
         note="这里的目标是软件中的培养清单，不会改动游戏内队伍、式神技能或御魂佩戴。"),
    dict(title="按需精算，查看结果", section="阵容与库存", shot="07-result",
         intro="精算使用当前库存寻找满足要求的成员与御魂方案。结果受库存完整性和阵容条件影响。",
         steps=[("确认账号与条件", "先选正确库存，再选择一组阵容。缺少原码解析内容时，应先完成解析。"),
                ("查看进度，按需暂停", "可精算选中项或全部阵容；长任务可使用“暂停精算”。等待期间可浏览其他页面。"),
                ("按差距继续处理", "查看缺式神、养成要求、御魂条件和配装结果。未完成、数据不足或未找到方案，不等于游戏内一定无法使用。")],
         note="精算是本地核对工具，不模拟所有战斗机制，也不会自动把御魂方案装进游戏。"),
    dict(title="汇总缺口，安排培养", section="阵容与库存", shot="08-gaps",
         intro="“缺口统计”把多套阵容的需求合并展示，帮助判断哪些式神值得优先补齐。",
         steps=[("选择统计范围", "先在阵容库筛选需要的条目，再打开“缺口统计”。弹窗顶部显示打开时的筛选范围。"),
                ("阅读需求排名", "看哪些式神在多套阵容中反复缺少，再结合自己的常玩副本安排培养。"),
                ("回到具体阵容确认", "统计用于发现共同需求；重复式神数量、技能等级及御魂仍应回到具体阵容逐项核对。")],
         note="未解析或资料不足的条目会影响统计覆盖率。不要把统计范围之外的阵容理解为没有缺口。"),
    dict(title="看清御魂的六个位置", section="阵容与库存", shot="09-souls", figure_max=310, annotate=False,
         intro="御魂视图按位置呈现配置，让套装和二、四、六号位主属性更容易对照。",
         steps=[("先核对套装", "区分四件套、两件套与额外两件属性要求；“不限套装”不等于可以忽略其他面板条件。"),
                ("再核对主属性", "二、四、六号位可能允许多个主属性。例如六号位可同时允许暴击和暴击伤害。"),
                ("最后看面板范围", "速度、暴击、攻击等条件共同生效。技能、星级、强化等级与配置方式也可能影响最终判断。")],
         note="图示用于解释位置和要求。请以自己的阵容条件、库存信息与精算结果为准。"),
    dict(title="导入并解析阵容码", section="阵容码与登录", shot="10-decode",
         intro="“阵容码查看”支持粘贴完整数据、官方短码，以及从包含二维码的图片读取数据。",
         steps=[("粘贴完整内容", "保留 #TA# 或 |TA| 前缀，不要截断末尾。完整 #TA# 数据通常可离线解析；官方 |TA| 短码需要联网查询。"),
                ("先检查结果，再保存", "核对阵容名称、副本、成员及要求，按页面按钮保存到阵容库。只有短码时，先登录可用角色。"),
                ("导入二维码图片", "选择清晰、完整的二维码图片。只有文字的截图不等同于二维码；读取失败时改用原图或直接粘贴原码。")],
         note="完整码或图片里未携带短码时，不能靠本地转换反推出原来的官方短码。新增官方短码需主动联网生成。"),
    dict(title="进入扫码登录", section="阵容码与登录", shot="12-login-panel", figure_max=355,
         intro="点击左下“登录／切换角色”，阅读页面提示后，再获取登录二维码。",
         steps=[("阅读并确认登录提示", "软件是非官方工具。登录页要求使用可弃用的小号；不能接受提示中的风险时，返回软件继续离线使用。"),
                ("获取二维码并确认", "按页面指引选择登录方式，用对应游戏客户端扫码并确认。二维码过期后重新获取，不重复扫描旧图。"),
                ("等待角色就绪", "扫码成功后，还需取得服务器和角色信息。查询就绪才表示可以继续解析短码。")],
         note="教程未展示可登录的真实二维码，也未读取个人凭据。扫码账号可以与平安志库存账号不同。"),
    dict(title="选择服务器与角色", section="阵容码与登录", shot="13-roles", figure_max=355,
         intro="登录后默认选择可用列表中等级最低的角色；需要时可手动更换。",
         steps=[("确认服务器", "展开服务器与角色设置，核对渠道、服务器及角色归属。列表不完整时按页面入口刷新角色。"),
                ("选择已创建的角色", "没有可用角色时，应先在游戏创建角色。图中的 12 级只是演示数据，并不是查询等级门槛。"),
                ("等待初始化，再查询", "软件会尝试取得阵容助手信息。若仍未开放，可先用该角色在游戏中打开一次阵容助手，再回来重试。")],
         note="没有确认到适用于所有角色、所有服务器的统一最低等级。以角色实际功能开放状态和返回提示为准。"),
    dict(title="保存登录与切换账号", section="阵容码与登录", shot="14-remembered", figure_max=335,
         intro="是否保存登录凭据由登录页面选项决定；保存后可尝试恢复会话，失效时仍需重新扫码。",
         steps=[("自行选择是否保存", "允许保存时，登录凭据仅在本机加密保存。查询、登录及主动分享请求会发送到网易服务。"),
                ("恢复已保存账号", "在已保存账号列表中选择条目，再点击恢复登录。不同账号和角色仍要分别确认查询状态。"),
                ("移除不再使用的凭据", "使用“忘记”入口移除对应已保存登录。退出当前会话与删除已保存凭据是两种不同操作。")],
         note="普通资料备份不包含登录凭据。换电脑恢复备份后，短码查询和官方分享可能需要重新登录。"),
    dict(title="开始制作一套阵容", section="阵容制作器", shot="15-builder",
         intro="先在页面上方填写名称、原码副本和说明，再逐位配置成员。也可从已解析阵容载入副本。",
         steps=[("按副本填充固定位置", "第一位只能选阴阳师或英杰，后面选择式神。不同副本使用对应的 1+5 或 1+6 位置，不能随意添加多余成员。"),
                ("调整配装优先级", "通过上移、下移或拖动调整式神顺序。第一位保持固定；顺序同时影响“高于后续”的约束范围。"),
                ("保存草稿或阵容", "草稿方便下次续作；“保存到阵容库”会校验当前内容并保存阵容。导出前必须选择游戏原码副本。")],
         note="本教程配置仅演示界面，不是实战推荐。“按顺序配速”设置的是游戏原生速度先后关系。"),
    dict(title="阴阳师技能与自动施法", section="阵容制作器", shot="16-actor-skills",
         intro="阴阳师与英杰使用自己的技能列表，不与式神的技能配置混用。",
         steps=[("选择两项携带技能", "从该角色允许携带的技能中选择。已选技能不能在另一位置重复选择；不同角色的可选内容不同。"),
                ("按阵容填写技能等级", "点击技能图标查看效果、鬼火消耗和冷却。战斗中的技能位置随携带组合确定，不能直接套用资料列表顺序。"),
                ("设置自动施法", "选择智能施法，或锁定列表中可用的一个技能。更换角色、携带技能或形态后，要重新核对自动施法选择。")],
         note="默认全部拥有阴阳师与英杰，具体等级、携带技能和技能等级仍以这套阵容的设置为准。"),
    dict(title="式神的技能与养成要求", section="阵容制作器", shot="18-shikigami",
         intro="每个位置独立设置星级、等级、觉醒状态、技能要求和自动施法，允许同名式神占据不同位置。",
         steps=[("先选养成状态", "填写等级、星级与觉醒要求；允许留空的项目表示不限制。改变觉醒状态可能改变技能资料与可用配置。"),
                ("按名称设置技能等级", "卡片同时显示第几技能、实际名称和图标。下拉框只列出该技能存在的等级，不能把所有技能都按五级处理。"),
                ("选择自动施法", "可选智能施法或合法的锁定技能。特殊式神的可选技能按角色规则展示，不能直接输入任意技能编号。")],
         note="“技能等级不限制”与“智能施法”分别控制养成要求和战斗行为，两者不是同一个设置。"),
    dict(title="查看逐级效果与变化技能", section="阵容制作器", shot="19-skill-detail", figure_max=390,
         intro="在制作器、库存或阵容详情点击技能卡片，打开技能说明。",
         steps=[("看名称、位置与消耗", "标题标明第几技能，图标旁显示鬼火消耗、最高等级及官方类型词条；有冷却信息时一并展示。"),
                ("展开等级与形态", "点击各等级查看描述。存在觉醒前后形态时可切换；“变化与衍生技能”展示相关技能，点击继续查看。"),
                ("理解词条的官方含义", "在下方阅读控制效果、特殊印记等词条解释。资料显示为衍生技能，不代表它一定能直接携带或锁定。")],
         note="技能内容来自游戏客户端快照。当前游戏更新可能改变效果；需要兼容资料变化时，请更新软件版本。"),
    dict(title="设置御魂与计算目标", section="阵容制作器", shot="20-equipment", figure_max=380,
         intro="式神可选择重新配置御魂，或保留当前御魂。重新配置时再填写套装与属性要求。",
         steps=[("选择套装和养成范围", "设置四件套、两件套、御魂星级和强化范围。展开附加区域，可设置额外两件套属性及战斗加成。"),
                ("填写目标与评分", "选择计算目标，或只寻找满足条件的方案。评分应与对应目标配合，不要把面板攻击直接填入评分。"),
                ("勾选主属性", "二、四、六号位支持多选，只展示该位置可用的属性。允许多个选项表示任选其一，不是同时拥有多个主属性。")],
         note="标为“小数”的战斗加成填 0.15 表示 15%；下一页面板范围中标为“%”的项目填 15 表示 15%。"),
    dict(title="数值范围与原生配速", section="阵容制作器", shot="21-ranges", figure_max=330,
         intro="使用下限、上限与“高于后续”描述游戏原码能保存的面板要求。",
         steps=[("填写面板范围", "下限、上限可只填一端，空白表示不限制。图中速度 180 至 210；暴击、暴伤、命中、抵抗按页面的百分数单位填写。"),
                ("设置最高属性", "勾选“高于后续”，表示本成员该属性要高于其后所有式神。它依赖成员顺序，调整顺序后需再次检查。"),
                ("一键按顺序配速", "在成员列表点击“按顺序配速”，为前面的式神设置速度高于后续成员的原生要求；可逐人调整。")],
         note="本版已移除任意成员差值／倍率关系编辑与计算，例如“A 比 B 快 10”。旧备份即使保留此字段，也不执行该约束。"),
    dict(title="契灵、等级与两个术印位", section="阵容制作器", shot="17-spirit", figure_max=392,
         intro="在阴阳师或英杰配置下选择契灵；可选范围随佩戴角色变化。",
         steps=[("选择可佩戴的契灵", "核对契灵说明和适用角色，按阵容设定星级与等级。等级 0 表示不限制，并非默认满级。"),
                ("查看实际增益", "界面按所选星级、等级展示属性和契灵技能。点击技能卡片查看对应说明，不凭空增加未设置的属性。"),
                ("配置两个术印位置", "选择术印及一至三级，两个位置不能重复选择同一术印。可选术印按对应配置组提供。")],
         note="历史原码含多种术印时会完整保留。只在修改术印配置时按两个编辑位重设；改动其他字段不会顺带丢弃原码术印。"),
    dict(title="导出二维码与官方短码", section="阵容制作器", shot="22-export", figure_max=295, annotate=False,
         intro="修改后先“生成预览”，再选择导出方式。游戏的扫码导入与文字导入使用不同内容。",
         steps=[("二维码：完整数据", "选择“导出二维码图片”，在游戏阵容助手通过二维码入口识别。二维码承载 #TA# 完整数据，可离线生成。"),
                ("完整码：软件间保存", "“复制完整数据”得到 #TA#，可用于本软件解析和留存。不要将它粘贴到游戏只接受官方短码的文字入口。"),
                ("短码：主动联网生成", "登录已有且可查询的角色后点击“生成官方短码”，成功后复制 |TA|… 到游戏文字入口。后续改动阵容必须重新生成。")],
         note="旧版生成但缺少合法副本的二维码或短码，需在新版选择正确原码副本后重新生成。不要扫描教程的演示阵容用于实战。"),
    dict(title="批量管理阵容库", section="管理与备份", shot="23-management", marker_numbers={1: 2, 2: 1},
         intro="在“阵容库管理”中筛选、排序、多选，再对选中项统一重新解析或删除。",
         steps=[("先筛选与排序", "按名称、原码、成员或副本搜索，按解析状态筛选，再用时间、名称、来源等排序方式检查记录。"),
                ("复选或全选筛选结果", "勾选需要处理的记录，留意选中数量。批量操作前检查当前筛选范围，避免误选不相关阵容。"),
                ("重新解析或删除", "短码重新查询需要登录；本地完整码按内容解析。删除前阅读确认范围；删除内置项可通过复位恢复。")],
         note="批量添加支持逐行原码、TXT／TSV，或从表格复制“阵容码、名称、副本／用途、备注”四列，不直接读取 XLSX。重新解析保留手动副本。"),
    dict(title="手动指定多个适用副本", section="管理与备份", shot="24-manual-stage", figure_max=345,
         intro="原码副本可能填错。管理编辑中的手动分类优先于原码、来源和预设整理规则。",
         steps=[("在管理中打开编辑", "查看已有用途标签。点击标签的 × 可移除该项；至少保留一项，或选择恢复自动分类。"),
                ("搜索并添加多个副本", "按副本名、首领、层数或分类搜索，点击候选逐项添加。同一套阵容可以出现在多个用途下。"),
                ("保存并识别扩展项", "游戏原码列表没有的用途会标为“扩展副本”。也可展开自定义路径；保存后重新解析仍保留手动选择。")],
         note="扩展副本仅用于软件分类，不会伪造游戏可导入的副本编号。勾选“恢复自动分类”并保存，会清除手动指定。"),
    dict(kind="backup", title="备份到底包含什么", section="管理与备份"),
    dict(title="恢复备份：合并并取最新", section="管理与备份", shot="25-restore", figure_max=305, annotate=False,
         intro="点击软件左下方“恢复备份”，选择备份文件并核对预览；确认后才写入。本机独有阵容会保留。",
         steps=[("核对数量和重复项", "本机、备份和内置预设一起比较；名称、阵容码或 ID 任一相同就归入重复组，包括与预设同码的记录。"),
                ("理解“时间最新”", "取修改、解析、创建、原始日期中的最新有效时间。无时间排最后；同时间依次优先本机、备份、预设。备份导出时间不参与比较。"),
                ("确认后检查结果", "库存账号、当前账号和制作草稿采用备份内容；保留下来的账号合并双方目标选择。恢复后可在本次运行中撤销一次。")],
         note="继续修改资料后，不能再直接撤销这次恢复。建议导入前先导出本机备份；重复关系会连通成组，不只是逐条两两覆盖。"),
    dict(title="复位为全部内置预设", section="管理与备份", shot="26-reset", figure_max=290, marker_numbers={1: 2},
         intro="这是恢复整库预设的操作，会清除自建、导入及手动修改内容。先看影响数量，再作决定。",
         steps=[("先留一份备份", "从阵容库管理打开复位弹窗，可先点击“导出备份”。核对当前数量和将被清除的自建／导入数量。"),
                ("等待五秒确认", "倒计时期间按钮不可点击。倒计时结束后，只有点击“确认复位全部阵容”才执行；取消则不改动。"),
                ("检查复位结果", "恢复全部内置阵容，撤销预设修改与删除；清除所有自建／导入阵容、目标选择及制作草稿。")],
         note="库存账号和登录凭据会保留。复位不会保留自建或导入阵容，也不是只恢复被删除的几个预设。", danger=True),
    dict(title="检查官方资料与来源", section="管理与备份", shot="27-updates", marker_numbers={1: 2, 2: 1},
         intro="在“来源与覆盖”查看内置资料日期、素材来源、覆盖情况及官方资料更新状态。",
         steps=[("查看当前资料日期", "先确认使用哪一批资料，遇到新式神、新技能或游戏改动时，不要默认离线资料已经同步。"),
                ("按需要更新官方资料", "页面入口可检查官方名单、属性、图片和公告等资料。网络失败时查看提示，稍后再试。"),
                ("技能与协议随软件更新", "阵容原码规则、客户端技能和契灵配置来自随软件提供的资料。仅点击官方资料更新，不代表这些配置也全部更新。")],
         note="技能、术印和相关图标取自 2026-09-12 客户端快照及对应补丁。真实效果以当前游戏为准。"),
    dict(kind="troubleshooting", title="遇到问题时这样处理", section="排错与版本说明"),
    dict(kind="validation", title="本版范围与验证说明", section="排错与版本说明"),
]
assert len(PAGES) == 32


def make_style(size=10.5, leading=16, color=INK, bold=False):
    return ParagraphStyle("text", fontName=BOLD if bold else FONT, fontSize=size,
                          leading=leading, textColor=color, wordWrap="CJK", alignment=TA_LEFT,
                          splitLongWords=True, spaceAfter=0, spaceBefore=0)


AUDIT = []
C = None
PAGE = 0


def para(text, x, top, width, size=10.5, leading=16, color=INK, bold=False,
         floor=43, rich=False):
    p = Paragraph(text if rich else html.escape(text), make_style(size, leading, color, bold))
    _, height = p.wrap(width, 1000)
    bottom = top - height
    assert bottom >= floor, f"Page {PAGE}: text overflows ({bottom:.1f}): {text[:60]}"
    assert x >= 0 and x + width <= W + 0.1
    p.drawOn(C, x, bottom)
    AUDIT.append(dict(page=PAGE, kind="text", text=text, x=round(x, 2), top=round(top, 2),
                      bottom=round(bottom, 2), width=round(width, 2), fontSize=size))
    return bottom


def line(y, x=M, width=CW, color=LINE):
    C.setStrokeColor(color)
    C.setLineWidth(0.6)
    C.line(x, y, x + width, y)


def rect(x, y, width, height, fill=WHITE, stroke=LINE, radius=7):
    C.setFillColor(fill)
    C.setStrokeColor(stroke)
    C.setLineWidth(0.6)
    C.roundRect(x, y, width, height, radius, fill=1, stroke=1)


def number(n, x, y, r=8.5):
    C.setFillColor(GOLD)
    C.setStrokeColor(WHITE)
    C.setLineWidth(1)
    C.circle(x, y, r, fill=1, stroke=1)
    C.setFillColor(WHITE)
    C.setFont(BOLD, 8)
    C.drawCentredString(x, y - 2.8, str(n))


def base(page):
    C.setFillColor(PAPER)
    C.rect(0, 0, W, H, fill=1, stroke=0)
    C.setFillColor(GOLD)
    C.rect(M, H - 39, 22, 2, fill=1, stroke=0)
    para(page["section"], M + 31, H - 31, CW - 31, size=9, leading=13, color=MUTED)
    C.bookmarkPage(f"p{PAGE}")
    C.addOutlineEntry(f"{PAGE:02d}  {page['title']}", f"p{PAGE}", 0)
    line(38)
    C.setFont(FONT, 8)
    C.setFillColor(MUTED)
    C.drawString(M, 23, "御契 0.9.3 · 图文教程 · 2026.09.23")
    C.drawRightString(W - M, 23, f"{PAGE:02d} / {len(PAGES):02d}")


def heading(title, intro):
    y = para(title, M, H - 65, CW, size=23, leading=31, bold=True)
    return para(intro, M, y - 11, CW, size=10.5, leading=17, color=MUTED) - 20


def screenshot(key, top, maximum=360, annotate=True, marker_numbers=None):
    item = IMAGES[key]
    source = ROOT / item["file"]
    with Image.open(source) as im:
        iw, ih = im.size
        assert (iw, ih) == (item["width"], item["height"])
    scale = min((CW - 16) / iw, maximum / ih)
    width, height = iw * scale, ih * scale
    x = (W - width) / 2
    y = top - height
    assert y > 225, (PAGE, key, y)
    rect(M, y - 7, CW, height + 14)
    C.drawImage(str(source), x, y, width, height, mask="auto")
    shown = []
    if annotate:
        for mark in item["anchors"]:
            left, right = max(0, mark["x"]), min(iw, mark["x"] + mark["width"])
            upper, lower = max(0, mark["y"]), min(ih, mark["y"] + mark["height"])
            if right <= left or lower <= upper:
                continue
            bx, by = x + left * scale, top - lower * scale
            bw, bh = (right - left) * scale, (lower - upper) * scale
            C.setStrokeColor(GOLD)
            C.setLineWidth(0.9)
            C.roundRect(bx, by, bw, bh, 2.5, stroke=1, fill=0)
            nx = min(x + width - 8, max(x + 8, bx + 1))
            ny = max(y + 9, min(top - 9, top - upper * scale))
            n = (marker_numbers or {}).get(mark["number"], mark["number"])
            number(n, nx, ny)
            shown.append(n)
    caption = "0.9.3 真实界面 · 合成演示资料"
    if shown:
        caption += " · 数字标出相关操作区"
    para(caption, M + 2, y - 13, CW - 4, size=8, leading=12, color=MUTED)
    AUDIT.append(dict(page=PAGE, kind="screenshot", name=key, x=x, top=top,
                      bottom=y, width=width, height=height, markers=shown))
    return y - 38


def note_box(text, top, danger=False, label="留意"):
    style = make_style(10, 15.5)
    p = Paragraph(html.escape(text), style)
    _, height = p.wrap(CW - 32, 1000)
    bh = height + 37
    y = top - bh
    assert y >= 51, f"Page {PAGE}: note overflows ({y:.1f})"
    rect(M, y, CW, bh, fill=TINT)
    para(label, M + 16, top - 10, CW - 32, size=9, leading=13,
         color=RED if danger else GOLD, bold=True)
    para(text, M + 16, top - 28, CW - 32, size=10, leading=15.5)
    return y - 12


def steps(items, top):
    y = top
    for i, (title, text) in enumerate(items, 1):
        number(i, M + 8.5, y - 6)
        bottom = para(title, M + 28, y + 1, CW - 28, size=11, leading=17, bold=True)
        y = para(text, M + 28, bottom - 3, CW - 28, size=10.5, leading=16) - 13
    return y


def link(label, url, top, x=M, width=CW, size=10.5):
    return para(f'<link href="{html.escape(url, quote=True)}" color="#99712d">{html.escape(label)}</link>',
                x, top, width, size=size, leading=17, rich=True)


def cover():
    C.setFillColor(INK)
    C.rect(0, H - 225, W, 225, fill=1, stroke=0)
    C.drawImage(str(ROOT / "app/assets/logo.png"), M, H - 99, 54, 54, mask="auto")
    para("御契", M + 69, H - 48, CW - 70, size=30, leading=39, color=WHITE, bold=True)
    para("阴阳师阵容助手", M + 70, H - 96, CW - 70, size=11, leading=17, color=LINE)
    para("新版图文使用指南", M, H - 149, CW, size=26, leading=36, color=WHITE, bold=True)
    para("v0.9.3  /  Windows x64  /  2026 年 9 月 23 日", M, H - 198, CW,
         size=10, leading=16, color=LINE)
    bottom = screenshot("01-home", H - 248, maximum=307, annotate=False)
    bottom = para("查找阵容 · 核对库存 · 制作与导出 · 安心管理备份", M, bottom + 2, CW,
                  size=15, leading=23, bold=True)
    bottom = para("32 页操作说明，配合 0.9.3 实际界面截图。示例账号、库存和制作阵容均为合成内容，不包含真实登录凭据，也不作为实战阵容推荐。",
                  M, bottom - 13, CW, size=11, leading=18, color=MUTED)
    bottom = note_box("本版为公开测试版。二维码、官方短码、首次角色初始化及各渠道登录的实机验证范围，见最后一页。",
                      bottom - 20, label="阅读前")
    link("打开 v0.9.3 发布页与下载附件", RELEASE, bottom - 6)


def contents():
    y = heading("从这里开始", "按你的目标选一条路线；目录条目和页面书签都可以直接跳转。")
    routes = [("只想查一套阵容", "首页 → 筛选 → 详情", 4),
              ("核对自己的库存", "导入平安志 → 目标 → 精算", 7),
              ("制作可导出的阵容", "成员 → 技能／御魂 → 导出", 17)]
    for title, body, page in routes:
        rect(M, y - 56, CW, 56)
        para(title, M + 14, y - 9, CW - 28, size=11, leading=17, bold=True)
        para(body, M + 14, y - 31, CW - 70, size=10, leading=15, color=MUTED)
        C.linkRect("", f"p{page}", (M, y - 56, W - M, y), relative=0, thickness=0)
        C.setFont(BOLD, 10)
        C.setFillColor(GOLD)
        C.drawRightString(W - M - 15, y - 33, f"P{page:02d}")
        y -= 66
    y -= 10
    groups = [("开始使用", 3, 3), ("阵容与库存", 4, 12), ("阵容码与登录", 13, 16),
              ("阵容制作器", 17, 24), ("管理与备份", 25, 30), ("排错与验证", 31, 32)]
    col_width = (CW - 26) / 2
    top = y
    for gi, (name, first, last) in enumerate(groups):
        col = 0 if gi < 3 else 1
        if gi == 3:
            y = top
        x = M + col * (col_width + 26)
        y = para(name, x, y, col_width, size=11, leading=17, color=GOLD, bold=True) - 4
        for idx in range(first, last + 1):
            text = PAGES[idx - 1]["title"]
            label = f"{idx:02d}  {text}"
            next_y = para(label, x, y, col_width, size=9.5, leading=17)
            C.linkRect("", f"p{idx}", (x, next_y, x + col_width, y), relative=0, thickness=0)
            y = next_y - 2
        y -= 12


def install():
    y = heading("下载、安装与升级", "从 v0.9.3 Release 的附件区选择程序。GitHub 的 Source code 文件不是可直接运行的软件。")
    cards = [("安装版", "Yuqi-Setup-0.9.3-Windows-x64.exe", "运行安装向导，选择目录；可创建桌面与开始菜单快捷方式。"),
             ("免安装版", "Yuqi-Portable-0.9.3-Windows-x64.zip", "先完整解压，再运行其中的“御契.exe”。不要只取出一个 EXE，也不要直接在压缩包内启动。"),
             ("图文教程与校验值", "Yuqi-Guide-0.9.3.pdf  ·  SHA256SUMS.txt", "PDF 可离线阅读；SHA256SUMS.txt 用于核对下载文件是否完整。")]
    for title, filename, text in cards:
        rect(M, y - 91, CW, 91)
        para(title, M + 15, y - 12, CW - 30, size=12, leading=18, bold=True)
        para(filename, M + 15, y - 37, CW - 30, size=10, leading=15, color=GOLD)
        para(text, M + 15, y - 58, CW - 30, size=10, leading=15)
        y -= 105
    y = steps([("升级前先导出资料备份", "退出旧版后再安装或解压新版。程序目录和资料目录用途不同，不要为了升级手动清空账号资料。"),
               ("首次启动先核对本地内容", "软件先进入本地使用；检查阵容库和库存，确有短码查询或分享需要时再登录。")], y - 2)
    y = note_box("当前程序未数字签名。若覆盖安装出现 pwsh.exe / Unknown Hard Error，停止覆盖，保留备份后改用完整免安装版；下载文件可用 SHA-256 核对。", y)
    link("打开官方项目的 v0.9.3 Release 附件区", RELEASE, y)


def backup():
    y = heading("备份到底包含什么", "点击软件左下方“导出备份”，将 JSON 文件保存在你能找回的位置。重要操作前建议另存一份。")
    items = [("包含", "阵容及原始解析数据", "自建、导入、内置阵容的本地修改，手动副本分类及相关记录。"),
             ("包含", "预设处理状态", "已删除预设、去重合并记录等状态，用于恢复当前资料结构。"),
             ("包含", "库存账号与原始库存", "库存账号、当前选中账号，以及导入的原始数据。备份含个人游戏资料。"),
             ("包含", "目标与制作草稿", "按账号保存的目标阵容选择，以及已保存的制作器草稿。"),
             ("不包含", "扫码登录凭据", "备份不会把记住的登录会话带到另一台电脑；需要时重新登录。"),
             ("不包含", "程序文件与运行缓存", "备份不是安装包，也不是整台电脑的镜像；精算或临时缓存不用于替代资料。")]
    for state, title, text in items:
        rect(M, y - 72, CW, 72, fill=WHITE if state == "包含" else TINT)
        para(state, M + 13, y - 12, 48, size=9, leading=16, color=GOLD, bold=True)
        para(title, M + 68, y - 11, CW - 80, size=11, leading=17, bold=True)
        para(text, M + 68, y - 35, CW - 83, size=10, leading=15)
        y -= 82
    y = note_box("导出只是生成备份文件，不会清空本机阵容。恢复时会先显示数量和合并规则，确认后才写入。备份文件不要公开上传。", y - 4)


def troubleshooting():
    y = heading("遇到问题时这样处理", "先保留原码和错误原文，再按现象处理；不要连续改动多个条件后再猜原因。")
    cases = [
        ("游戏文字入口“识别失败”", "若粘贴的是 #TA#，改用二维码入口；文字入口使用成功生成的 |TA| 官方短码。"),
        ("“阵容码设置有误，暂不支持导入”", "用新版制作器重新选择游戏原码副本，检查成员位置、技能与范围后生成新二维码／短码。旧分享不会随本地修改自动更新。"),
        ("登录了，仍不能查询阵容", "确认服务器、角色和查询就绪状态。尝试用该角色在游戏打开一次阵容助手，再回软件重试；没有角色则先在游戏创建。"),
        ("31279：分享已过期或无法读取", "向来源取得仍有效的新码。过期短码不能仅靠本地转换恢复其内容。"),
        ("90011、网络错误或临时失败", "等待后重试，检查网络及会话是否过期；批量处理可暂停。一次失败不应立即删除整套阵容。"),
        ("二维码图片读取失败", "换清晰原图，保留完整边框，避免压缩、遮挡与截断；也可直接粘贴原码。"),
        ("阵容很多，操作变慢", "先筛选并精算选中项，暂停暂不需要的批量任务。异常持续时保留复现步骤、阵容数量和错误信息。"),
        ("提示保存失败或数据异常", "不要把未成功保存当作已经落盘；先导出能读取的资料，检查磁盘空间和目录权限，再通过备份预览恢复。"),
    ]
    for title, text in cases:
        y = para(title, M, y, CW, size=10.8, leading=17, bold=True, color=GOLD) - 3
        y = para(text, M, y, CW, size=10.3, leading=16) - 12
        line(y + 5)
    para("反馈时附：软件版本、操作步骤、错误原文及可公开的阵容码。不要发送登录二维码、令牌或未经脱敏的库存备份。",
         M, y, CW, size=9.5, leading=15, color=MUTED)


def validation():
    y = heading("本版范围与验证说明", "教程对应御契 0.9.3 公开测试版。界面截图由正式页面渲染，使用隔离目录与合成数据。")
    y = para("已经完成的本地验证", M, y, CW, size=14, leading=21, bold=True) - 12
    facts = [
        "244 项 Node、55 项 Python 检查通过；另有 23 项制作器、37 项通用界面检查及综合页面回归。",
        "328 条内置真实解析结果通过规则校验，重编码后成员配置保持一致。",
        "资料含 1,036 个技能、4,954 条等级记录、1,026 张真实技能图标；2,952 张本地图片通过摘要、解码和尺寸检查。",
        "3,000 条阵容与 5,000 个合成式神的连续查询保存测试中可持续切页；计时器最大间隔约 52.3 毫秒。该数值仅代表此测试环境。",
        "安装包解包后的程序与免安装版逐文件核验；隔离启动取得 158 个服务器及登录二维码，未进行手机扫码。",
    ]
    for text in facts:
        y = para("• " + text, M, y, CW, size=10.5, leading=17) - 11
    y -= 3
    y = para("仍需实机补验", M, y, CW, size=14, leading=21, bold=True) - 10
    y = para("首次进入阵容助手的角色能否自动初始化、所有渠道服／官服／iOS／安卓组合，以及生成内容在当前游戏中的实际导入结果，尚未全部验证。静态规则和本机编解码通过，不等于这些实机环节已经通过。",
             M, y, CW, size=10.5, leading=17) - 14
    y = para("安装、覆盖升级和卸载全过程也未在真实安装环境中重做；本轮交付验证采用独立解包启动，不覆盖现有安装。",
             M, y, CW, size=10.5, leading=17) - 20
    y = note_box("技能与相关素材来自本机游戏客户端快照；软件本地保留素材来源与校验信息。教程中的游戏图标来自对应对象，未用生成图替代。", y, label="资料说明")
    y = link("下载 v0.9.3 程序、PDF 与 SHA256SUMS.txt", RELEASE, y - 2)
    link("打开项目问题反馈页面", "https://github.com/tORHANSxd/onmyoji-lineup-atlas/issues", y - 10)


def build():
    global C, PAGE
    OUT.parent.mkdir(parents=True, exist_ok=True)
    C = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1, invariant=1)
    C.setTitle("御契 0.9.3 图文使用指南")
    C.setAuthor("御契项目 / tORHANSxd")
    C.setSubject("阵容查找、库存核对、阵容制作、扫码登录、备份恢复与排错")
    C.setKeywords("御契,阴阳师,0.9.3,图文教程,阵容制作器,备份,PDF")
    C.setViewerPreference("DisplayDocTitle", "true")
    special = dict(cover=cover, contents=contents, install=install, backup=backup,
                   troubleshooting=troubleshooting, validation=validation)
    for PAGE, page in enumerate(PAGES, 1):
        base(page)
        if page.get("kind") in special:
            special[page["kind"]]()
        else:
            y = heading(page["title"], page["intro"])
            y = screenshot(page["shot"], y, page.get("figure_max", 355), page.get("annotate", True), page.get("marker_numbers"))
            y = steps(page["steps"], y)
            note_box(page["note"], y + 2, page.get("danger", False))
        C.showPage()
    C.save()
    reader = PdfReader(str(OUT))
    assert len(reader.pages) == len(PAGES)
    page_text = [page.extract_text() for page in reader.pages]
    for i, (page, text) in enumerate(zip(PAGES, page_text), 1):
        expected = "新版图文使用指南" if i == 1 else page["title"]
        assert expected in text, (i, expected)
        assert "\ufffd" not in text and "\u25a0" not in text, i
    report = dict(version="0.9.3", output=str(OUT.relative_to(ROOT)), pageCount=len(reader.pages),
                  sha256=hashlib.sha256(OUT.read_bytes()).hexdigest(), bytes=OUT.stat().st_size,
                  screenshots=len({item["name"] for item in AUDIT if item["kind"] == "screenshot"}),
                  sourceScreenshots=len(MANIFEST["shots"]), synthetic=True, privateDataUsed=False,
                  embeddedFonts=[FONT, BOLD], allTitlesPresent=True, textWithinPage=True,
                  annotationCount=sum(len(p.get("/Annots", [])) for p in reader.pages),
                  visualReview="pending", pages=[dict(page=i, title=p["title"]) for i, p in enumerate(PAGES, 1)],
                  layout=AUDIT)
    (ROOT / "verification/guide-v093.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ("pages", "layout")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build()
