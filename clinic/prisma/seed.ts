import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const HERBS = [
  { name: "人参", pinyin: "ren shen", category: "补气药", nature: "温", flavor: "甘、微苦", meridians: "脾、肺、心", effects: "大补元气，复脉固脱，补脾益肺", dosageMin: 3, dosageMax: 9 },
  { name: "黄芪", pinyin: "huang qi", category: "补气药", nature: "温", flavor: "甘", meridians: "脾、肺", effects: "补气升阳，固表止汗，利水消肿", dosageMin: 9, dosageMax: 30 },
  { name: "白术", pinyin: "bai zhu", category: "补气药", nature: "温", flavor: "甘、苦", meridians: "脾、胃", effects: "健脾益气，燥湿利水，止汗安胎", dosageMin: 6, dosageMax: 12 },
  { name: "甘草", pinyin: "gan cao", category: "补气药", nature: "平", flavor: "甘", meridians: "心、肺、脾、胃", effects: "补脾益气，清热解毒，调和诸药", dosageMin: 2, dosageMax: 10 },
  { name: "茯苓", pinyin: "fu ling", category: "利水渗湿药", nature: "平", flavor: "甘、淡", meridians: "心、脾、肾", effects: "利水渗湿，健脾宁心", dosageMin: 9, dosageMax: 15 },
  { name: "当归", pinyin: "dang gui", category: "补血药", nature: "温", flavor: "甘、辛", meridians: "肝、心、脾", effects: "补血活血，调经止痛，润肠通便", dosageMin: 6, dosageMax: 12 },
  { name: "川芎", pinyin: "chuan xiong", category: "活血化瘀药", nature: "温", flavor: "辛", meridians: "肝、胆、心包", effects: "活血行气，祛风止痛", dosageMin: 3, dosageMax: 9 },
  { name: "白芍", pinyin: "bai shao", category: "补血药", nature: "微寒", flavor: "苦、酸", meridians: "肝、脾", effects: "养血调经，敛阴止汗，柔肝止痛", dosageMin: 6, dosageMax: 15 },
  { name: "熟地黄", pinyin: "shu di huang", category: "补血药", nature: "微温", flavor: "甘", meridians: "肝、肾", effects: "补血滋阴，益精填髓", dosageMin: 9, dosageMax: 30 },
  { name: "生地黄", pinyin: "sheng di huang", category: "清热凉血药", nature: "寒", flavor: "甘、苦", meridians: "心、肝、肾", effects: "清热凉血，养阴生津", dosageMin: 10, dosageMax: 15 },
  { name: "麻黄", pinyin: "ma huang", category: "解表药", nature: "温", flavor: "辛、微苦", meridians: "肺、膀胱", effects: "发汗解表，宣肺平喘，利水消肿", dosageMin: 2, dosageMax: 9 },
  { name: "桂枝", pinyin: "gui zhi", category: "解表药", nature: "温", flavor: "辛、甘", meridians: "心、肺、膀胱", effects: "发汗解肌，温通经脉，助阳化气", dosageMin: 3, dosageMax: 9 },
  { name: "柴胡", pinyin: "chai hu", category: "解表药", nature: "微寒", flavor: "辛、苦", meridians: "肝、胆", effects: "和解表里，疏肝升阳", dosageMin: 3, dosageMax: 9 },
  { name: "葛根", pinyin: "ge gen", category: "解表药", nature: "凉", flavor: "甘、辛", meridians: "脾、胃", effects: "解肌退热，透疹，升阳止泻", dosageMin: 9, dosageMax: 15 },
  { name: "黄芩", pinyin: "huang qin", category: "清热燥湿药", nature: "寒", flavor: "苦", meridians: "肺、胆、脾、大肠、小肠", effects: "清热燥湿，泻火解毒，止血安胎", dosageMin: 3, dosageMax: 9 },
  { name: "黄连", pinyin: "huang lian", category: "清热燥湿药", nature: "寒", flavor: "苦", meridians: "心、脾、胃、肝、胆、大肠", effects: "清热燥湿，泻火解毒", dosageMin: 2, dosageMax: 5 },
  { name: "黄柏", pinyin: "huang bai", category: "清热燥湿药", nature: "寒", flavor: "苦", meridians: "肾、膀胱", effects: "清热燥湿，泻火除蒸，解毒疗疮", dosageMin: 3, dosageMax: 12 },
  { name: "栀子", pinyin: "zhi zi", category: "清热泻火药", nature: "寒", flavor: "苦", meridians: "心、肺、三焦", effects: "泻火除烦，清热利湿，凉血解毒", dosageMin: 6, dosageMax: 9 },
  { name: "连翘", pinyin: "lian qiao", category: "清热解毒药", nature: "微寒", flavor: "苦", meridians: "肺、心、小肠", effects: "清热解毒，消肿散结，疏散风热", dosageMin: 6, dosageMax: 15 },
  { name: "金银花", pinyin: "jin yin hua", category: "清热解毒药", nature: "寒", flavor: "甘", meridians: "肺、心、胃", effects: "清热解毒，疏散风热", dosageMin: 6, dosageMax: 15 },
  { name: "半夏", pinyin: "ban xia", category: "化痰止咳药", nature: "温", flavor: "辛", meridians: "脾、胃、肺", effects: "燥湿化痰，降逆止呕，消痞散结", dosageMin: 3, dosageMax: 9, cautions: "反乌头" },
  { name: "陈皮", pinyin: "chen pi", category: "理气药", nature: "温", flavor: "辛、苦", meridians: "脾、肺", effects: "理气健脾，燥湿化痰", dosageMin: 3, dosageMax: 9 },
  { name: "枳壳", pinyin: "zhi ke", category: "理气药", nature: "微寒", flavor: "苦、辛、酸", meridians: "脾、胃、大肠", effects: "理气宽中，行滞消胀", dosageMin: 3, dosageMax: 9 },
  { name: "香附", pinyin: "xiang fu", category: "理气药", nature: "平", flavor: "辛、微苦、微甘", meridians: "肝、脾、三焦", effects: "疏肝解郁，理气宽中，调经止痛", dosageMin: 6, dosageMax: 9 },
  { name: "山药", pinyin: "shan yao", category: "补气药", nature: "平", flavor: "甘", meridians: "脾、肺、肾", effects: "补脾养胃，生津益肺，补肾涩精", dosageMin: 15, dosageMax: 30 },
  { name: "山茱萸", pinyin: "shan zhu yu", category: "收涩药", nature: "微温", flavor: "酸、涩", meridians: "肝、肾", effects: "补益肝肾，收涩固脱", dosageMin: 6, dosageMax: 12 },
  { name: "泽泻", pinyin: "ze xie", category: "利水渗湿药", nature: "寒", flavor: "甘、淡", meridians: "肾、膀胱", effects: "利水渗湿，泄热", dosageMin: 6, dosageMax: 9 },
  { name: "牡丹皮", pinyin: "mu dan pi", category: "清热凉血药", nature: "微寒", flavor: "苦、辛", meridians: "心、肝、肾", effects: "清热凉血，活血化瘀", dosageMin: 6, dosageMax: 12 },
  { name: "附子", pinyin: "fu zi", category: "温里药", nature: "热", flavor: "辛、甘", meridians: "心、肾、脾", effects: "回阳救逆，补火助阳，散寒止痛", dosageMin: 3, dosageMax: 15, cautions: "有毒，需先煎" },
  { name: "干姜", pinyin: "gan jiang", category: "温里药", nature: "热", flavor: "辛", meridians: "脾、胃、肾、心、肺", effects: "温中散寒，回阳通脉，温肺化饮", dosageMin: 3, dosageMax: 9 },
  { name: "肉桂", pinyin: "rou gui", category: "温里药", nature: "热", flavor: "辛、甘", meridians: "肾、脾、心、肝", effects: "补火助阳，引火归元，散寒止痛", dosageMin: 1, dosageMax: 5 },
  { name: "丁香", pinyin: "ding xiang", category: "温里药", nature: "温", flavor: "辛", meridians: "脾、胃、肺、肾", effects: "温中降逆，补肾助阳", dosageMin: 1, dosageMax: 3 },
  { name: "大黄", pinyin: "da huang", category: "泻下药", nature: "寒", flavor: "苦", meridians: "脾、胃、大肠、肝、心包", effects: "泻下攻积，清热泻火，凉血解毒", dosageMin: 3, dosageMax: 15 },
  { name: "芒硝", pinyin: "mang xiao", category: "泻下药", nature: "寒", flavor: "咸、苦", meridians: "胃、大肠", effects: "泻下通便，润燥软坚，清火消肿", dosageMin: 6, dosageMax: 12 },
  { name: "杏仁", pinyin: "xing ren", category: "化痰止咳药", nature: "微温", flavor: "苦", meridians: "肺、大肠", effects: "降气止咳平喘，润肠通便", dosageMin: 5, dosageMax: 9 },
  { name: "桔梗", pinyin: "jie geng", category: "化痰止咳药", nature: "平", flavor: "苦、辛", meridians: "肺", effects: "宣肺，利咽，祛痰，排脓", dosageMin: 3, dosageMax: 9 },
  { name: "贝母", pinyin: "bei mu", category: "化痰止咳药", nature: "微寒", flavor: "苦、甘", meridians: "肺、心", effects: "清热散结，化痰止咳", dosageMin: 3, dosageMax: 9, cautions: "反乌头" },
  { name: "远志", pinyin: "yuan zhi", category: "安神药", nature: "温", flavor: "苦、辛", meridians: "心、肾、肺", effects: "安神益智，祛痰消肿", dosageMin: 3, dosageMax: 9 },
  { name: "酸枣仁", pinyin: "suan zao ren", category: "安神药", nature: "平", flavor: "甘、酸", meridians: "心、肝、胆", effects: "养心补肝，宁心安神，敛汗生津", dosageMin: 9, dosageMax: 15 },
  { name: "龙骨", pinyin: "long gu", category: "安神药", nature: "平", flavor: "甘、涩", meridians: "心、肝、肾", effects: "镇惊安神，平肝潜阳，收敛固涩", dosageMin: 15, dosageMax: 30 },
  { name: "牡蛎", pinyin: "mu li", category: "安神药", nature: "微寒", flavor: "咸、涩", meridians: "肝、肾", effects: "重镇安神，潜阳补阴，软坚散结", dosageMin: 15, dosageMax: 30 },
  { name: "天麻", pinyin: "tian ma", category: "平肝熄风药", nature: "平", flavor: "甘", meridians: "肝", effects: "息风止痉，平抑肝阳，祛风通络", dosageMin: 3, dosageMax: 9 },
  { name: "钩藤", pinyin: "gou teng", category: "平肝熄风药", nature: "微寒", flavor: "甘", meridians: "肝、心包", effects: "息风定惊，清热平肝", dosageMin: 3, dosageMax: 12 },
  { name: "菊花", pinyin: "ju hua", category: "解表药", nature: "微寒", flavor: "辛、甘、苦", meridians: "肺、肝", effects: "散风清热，平肝明目，清热解毒", dosageMin: 5, dosageMax: 9 },
  { name: "薄荷", pinyin: "bo he", category: "解表药", nature: "凉", flavor: "辛", meridians: "肺、肝", effects: "疏散风热，清利头目，利咽透疹", dosageMin: 3, dosageMax: 6 },
  { name: "防风", pinyin: "fang feng", category: "解表药", nature: "微温", flavor: "辛、甘", meridians: "膀胱、肝、脾", effects: "祛风解表，胜湿止痛，止痉", dosageMin: 5, dosageMax: 9 },
  { name: "荆芥", pinyin: "jing jie", category: "解表药", nature: "微温", flavor: "辛", meridians: "肺、肝", effects: "祛风解表，透疹消疮，止血", dosageMin: 5, dosageMax: 9 },
  { name: "羌活", pinyin: "qiang huo", category: "解表药", nature: "温", flavor: "辛、苦", meridians: "膀胱、肾", effects: "解表散寒，祛风胜湿，止痛", dosageMin: 3, dosageMax: 9 },
  { name: "独活", pinyin: "du huo", category: "祛风湿药", nature: "微温", flavor: "辛、苦", meridians: "肾、膀胱", effects: "祛风除湿，通痹止痛", dosageMin: 3, dosageMax: 9 },
  { name: "威灵仙", pinyin: "wei ling xian", category: "祛风湿药", nature: "温", flavor: "辛、咸", meridians: "膀胱", effects: "祛风除湿，通络止痛", dosageMin: 6, dosageMax: 9 },
  { name: "苍术", pinyin: "cang zhu", category: "化湿药", nature: "温", flavor: "辛、苦", meridians: "脾、胃、肝", effects: "燥湿健脾，祛风散寒", dosageMin: 5, dosageMax: 9 },
  { name: "厚朴", pinyin: "hou po", category: "化湿药", nature: "温", flavor: "苦、辛", meridians: "脾、胃、肺、大肠", effects: "燥湿消痰，下气除满", dosageMin: 3, dosageMax: 9 },
  { name: "砂仁", pinyin: "sha ren", category: "化湿药", nature: "温", flavor: "辛", meridians: "脾、胃、肾", effects: "化湿开胃，温脾止泻，理气安胎", dosageMin: 3, dosageMax: 6 },
  { name: "薏苡仁", pinyin: "yi yi ren", category: "利水渗湿药", nature: "凉", flavor: "甘、淡", meridians: "脾、胃、肺", effects: "利水渗湿，健脾止泻，除痹排脓", dosageMin: 9, dosageMax: 30 },
  { name: "车前子", pinyin: "che qian zi", category: "利水渗湿药", nature: "寒", flavor: "甘", meridians: "肝、肾、肺、小肠", effects: "清热利尿，渗湿通淋，明目祛痰", dosageMin: 9, dosageMax: 15 },
  { name: "丹参", pinyin: "dan shen", category: "活血化瘀药", nature: "微寒", flavor: "苦", meridians: "心、肝", effects: "活血祛瘀，通经止痛，清心除烦", dosageMin: 9, dosageMax: 15 },
  { name: "红花", pinyin: "hong hua", category: "活血化瘀药", nature: "温", flavor: "辛", meridians: "心、肝", effects: "活血通经，散瘀止痛", dosageMin: 3, dosageMax: 9 },
  { name: "桃仁", pinyin: "tao ren", category: "活血化瘀药", nature: "平", flavor: "苦、甘", meridians: "心、肝、大肠", effects: "活血祛瘀，润肠通便，止咳平喘", dosageMin: 5, dosageMax: 9 },
  { name: "三七", pinyin: "san qi", category: "止血药", nature: "温", flavor: "甘、微苦", meridians: "肝、胃", effects: "散瘀止血，消肿定痛", dosageMin: 3, dosageMax: 9 },
  { name: "艾叶", pinyin: "ai ye", category: "止血药", nature: "温", flavor: "辛、苦", meridians: "肝、脾、肾", effects: "温经止血，散寒止痛", dosageMin: 3, dosageMax: 9 },
  { name: "何首乌", pinyin: "he shou wu", category: "补血药", nature: "微温", flavor: "苦、甘、涩", meridians: "肝、心、肾", effects: "补肝肾，益精血，乌须发", dosageMin: 6, dosageMax: 12 },
  { name: "枸杞子", pinyin: "gou qi zi", category: "补阴药", nature: "平", flavor: "甘", meridians: "肝、肾", effects: "滋补肝肾，益精明目", dosageMin: 6, dosageMax: 12 },
  { name: "女贞子", pinyin: "nv zhen zi", category: "补阴药", nature: "凉", flavor: "甘、苦", meridians: "肝、肾", effects: "滋补肝肾，乌须明目", dosageMin: 6, dosageMax: 12 },
  { name: "麦冬", pinyin: "mai dong", category: "补阴药", nature: "微寒", flavor: "甘、微苦", meridians: "心、肺、胃", effects: "养阴生津，润肺清心", dosageMin: 6, dosageMax: 12 },
  { name: "天冬", pinyin: "tian dong", category: "补阴药", nature: "寒", flavor: "甘、苦", meridians: "肺、肾", effects: "养阴润燥，清肺生津", dosageMin: 6, dosageMax: 12 },
  { name: "玄参", pinyin: "xuan shen", category: "清热凉血药", nature: "微寒", flavor: "甘、苦、咸", meridians: "肺、胃、肾", effects: "凉血滋阴，泻火解毒", dosageMin: 9, dosageMax: 15 },
  { name: "沙参", pinyin: "sha shen", category: "补阴药", nature: "微寒", flavor: "甘", meridians: "肺、胃", effects: "养阴清肺，化痰益气", dosageMin: 9, dosageMax: 15 },
  { name: "石斛", pinyin: "shi hu", category: "补阴药", nature: "微寒", flavor: "甘", meridians: "胃、肾", effects: "益胃生津，滋阴清热", dosageMin: 6, dosageMax: 12 },
  { name: "百合", pinyin: "bai he", category: "补阴药", nature: "微寒", flavor: "甘", meridians: "心、肺", effects: "养阴润肺，清心安神", dosageMin: 6, dosageMax: 12 },
  { name: "杜仲", pinyin: "du zhong", category: "补阳药", nature: "温", flavor: "甘", meridians: "肝、肾", effects: "补肝肾，强筋骨，安胎", dosageMin: 6, dosageMax: 9 },
  { name: "续断", pinyin: "xu duan", category: "补阳药", nature: "微温", flavor: "苦、辛", meridians: "肝、肾", effects: "补肝肾，强筋骨，续折伤，止崩漏", dosageMin: 9, dosageMax: 15 },
  { name: "菟丝子", pinyin: "tu si zi", category: "补阳药", nature: "平", flavor: "辛、甘", meridians: "肝、肾、脾", effects: "补肾益精，养肝明目", dosageMin: 6, dosageMax: 12 },
  { name: "淫羊藿", pinyin: "yin yang huo", category: "补阳药", nature: "温", flavor: "辛、甘", meridians: "肝、肾", effects: "补肾阳，强筋骨，祛风湿", dosageMin: 3, dosageMax: 9 },
  { name: "五味子", pinyin: "wu wei zi", category: "收涩药", nature: "温", flavor: "酸、甘", meridians: "肺、心、肾", effects: "收敛固涩，益气生津，补肾宁心", dosageMin: 2, dosageMax: 6 },
  { name: "芡实", pinyin: "qian shi", category: "收涩药", nature: "平", flavor: "甘、涩", meridians: "脾、肾", effects: "益肾固精，补脾止泻，除湿止带", dosageMin: 9, dosageMax: 15 },
  { name: "乌梅", pinyin: "wu mei", category: "收涩药", nature: "平", flavor: "酸、涩", meridians: "肝、脾、肺、大肠", effects: "敛肺止咳，涩肠止泻，安蛔止痛", dosageMin: 6, dosageMax: 12 },
  { name: "白芷", pinyin: "bai zhi", category: "解表药", nature: "温", flavor: "辛", meridians: "肺、胃、大肠", effects: "解表散寒，祛风止痛，通鼻窍", dosageMin: 3, dosageMax: 9 },
  { name: "细辛", pinyin: "xi xin", category: "解表药", nature: "温", flavor: "辛", meridians: "心、肺、肾", effects: "祛风散寒，通窍止痛，温肺化饮", dosageMin: 1, dosageMax: 3, cautions: "用量不宜过大" },
  { name: "苍耳子", pinyin: "cang er zi", category: "解表药", nature: "温", flavor: "辛、苦", meridians: "肺", effects: "散风除湿，通鼻窍", dosageMin: 3, dosageMax: 9 },
  { name: "蝉蜕", pinyin: "chan tui", category: "解表药", nature: "寒", flavor: "甘", meridians: "肺、肝", effects: "疏散风热，利咽开音，透疹止痒", dosageMin: 3, dosageMax: 9 },
  { name: "升麻", pinyin: "sheng ma", category: "解表药", nature: "微寒", flavor: "辛、微甘", meridians: "肺、脾、胃、大肠", effects: "发表透疹，清热解毒，升举阳气", dosageMin: 3, dosageMax: 9 },
  { name: "龙胆草", pinyin: "long dan cao", category: "清热燥湿药", nature: "寒", flavor: "苦", meridians: "肝、胆", effects: "清热燥湿，泻肝胆火", dosageMin: 3, dosageMax: 6 },
  { name: "苦参", pinyin: "ku shen", category: "清热燥湿药", nature: "寒", flavor: "苦", meridians: "心、肝、胃、大肠、膀胱", effects: "清热燥湿，杀虫利尿", dosageMin: 5, dosageMax: 9 },
  { name: "白鲜皮", pinyin: "bai xian pi", category: "清热燥湿药", nature: "寒", flavor: "苦", meridians: "脾、胃、膀胱", effects: "清热燥湿，祛风解毒", dosageMin: 5, dosageMax: 9 },
  { name: "石膏", pinyin: "shi gao", category: "清热泻火药", nature: "大寒", flavor: "甘、辛", meridians: "肺、胃", effects: "清热泻火，除烦止渴", dosageMin: 15, dosageMax: 60 },
  { name: "知母", pinyin: "zhi mu", category: "清热泻火药", nature: "寒", flavor: "苦、甘", meridians: "肺、胃、肾", effects: "清热泻火，滋阴润燥", dosageMin: 6, dosageMax: 12 },
  { name: "夏枯草", pinyin: "xia ku cao", category: "清热泻火药", nature: "寒", flavor: "辛、苦", meridians: "肝、胆", effects: "清热泻火，明目散结", dosageMin: 9, dosageMax: 15 },
  { name: "蒲公英", pinyin: "pu gong ying", category: "清热解毒药", nature: "寒", flavor: "苦、甘", meridians: "肝、胃", effects: "清热解毒，消肿散结，利尿通淋", dosageMin: 9, dosageMax: 15 },
  { name: "板蓝根", pinyin: "ban lan gen", category: "清热解毒药", nature: "寒", flavor: "苦", meridians: "心、胃", effects: "清热解毒，凉血利咽", dosageMin: 9, dosageMax: 15 },
  { name: "鱼腥草", pinyin: "yu xing cao", category: "清热解毒药", nature: "微寒", flavor: "辛", meridians: "肺", effects: "清热解毒，消痈排脓，利尿通淋", dosageMin: 15, dosageMax: 25 },
  { name: "白花蛇舌草", pinyin: "bai hua she she cao", category: "清热解毒药", nature: "寒", flavor: "苦、甘", meridians: "胃、大肠、小肠", effects: "清热解毒，利湿通淋", dosageMin: 15, dosageMax: 60 },
  { name: "木香", pinyin: "mu xiang", category: "理气药", nature: "温", flavor: "辛、苦", meridians: "脾、胃、大肠、三焦、胆", effects: "行气止痛，健脾消食", dosageMin: 3, dosageMax: 6 },
  { name: "乌药", pinyin: "wu yao", category: "理气药", nature: "温", flavor: "辛", meridians: "肺、脾、肾、膀胱", effects: "行气止痛，温肾散寒", dosageMin: 6, dosageMax: 9 },
  { name: "延胡索", pinyin: "yan hu suo", category: "活血化瘀药", nature: "温", flavor: "辛、苦", meridians: "肝、脾", effects: "活血散瘀，行气止痛", dosageMin: 3, dosageMax: 9 },
  { name: "郁金", pinyin: "yu jin", category: "活血化瘀药", nature: "寒", flavor: "辛、苦", meridians: "肝、心、肺", effects: "活血止痛，行气解郁，清心凉血", dosageMin: 3, dosageMax: 9 },
  { name: "瓜蒌", pinyin: "gua lou", category: "化痰止咳药", nature: "寒", flavor: "甘、微苦", meridians: "肺、胃、大肠", effects: "清热涤痰，宽胸散结，润燥滑肠", dosageMin: 9, dosageMax: 15, cautions: "反乌头" },
  { name: "竹茹", pinyin: "zhu ru", category: "化痰止咳药", nature: "微寒", flavor: "甘", meridians: "肺、胃、心、胆", effects: "清热化痰，除烦止呕", dosageMin: 5, dosageMax: 9 },
  { name: "柏子仁", pinyin: "bai zi ren", category: "安神药", nature: "平", flavor: "甘", meridians: "心、肾、大肠", effects: "养心安神，润肠通便，止汗", dosageMin: 9, dosageMax: 15 },
  { name: "合欢皮", pinyin: "he huan pi", category: "安神药", nature: "平", flavor: "甘", meridians: "心、肝", effects: "解郁安神，活血消肿", dosageMin: 6, dosageMax: 12 },
  { name: "益母草", pinyin: "yi mu cao", category: "活血化瘀药", nature: "微寒", flavor: "辛、苦", meridians: "肝、心包、膀胱", effects: "活血调经，利尿消肿，清热解毒", dosageMin: 9, dosageMax: 30 },
  { name: "川牛膝", pinyin: "chuan niu xi", category: "活血化瘀药", nature: "平", flavor: "苦、酸", meridians: "肝、肾", effects: "逐瘀通经，通利关节，利尿通淋", dosageMin: 6, dosageMax: 9 },
  { name: "地龙", pinyin: "di long", category: "平肝熄风药", nature: "寒", flavor: "咸", meridians: "肝、脾、膀胱", effects: "清热定惊，通络平喘，利尿", dosageMin: 5, dosageMax: 9 },
  { name: "僵蚕", pinyin: "jiang can", category: "平肝熄风药", nature: "平", flavor: "咸、辛", meridians: "肝、肺、胃", effects: "息风止痉，祛风止痛，化痰散结", dosageMin: 5, dosageMax: 9 },
];

const INCOMPATIBLE_PAIRS = [
  // 十八反
  { herbA: "甘草", herbB: "甘遂", type: "EIGHTEEN_INCOMPATIBLES", note: "甘草反甘遂" },
  { herbA: "甘草", herbB: "大戟", type: "EIGHTEEN_INCOMPATIBLES", note: "甘草反大戟" },
  { herbA: "甘草", herbB: "海藻", type: "EIGHTEEN_INCOMPATIBLES", note: "甘草反海藻" },
  { herbA: "甘草", herbB: "芫花", type: "EIGHTEEN_INCOMPATIBLES", note: "甘草反芫花" },
  { herbA: "乌头", herbB: "贝母", type: "EIGHTEEN_INCOMPATIBLES", note: "乌头反贝母" },
  { herbA: "乌头", herbB: "瓜蒌", type: "EIGHTEEN_INCOMPATIBLES", note: "乌头反瓜蒌" },
  { herbA: "乌头", herbB: "半夏", type: "EIGHTEEN_INCOMPATIBLES", note: "乌头反半夏" },
  { herbA: "乌头", herbB: "白蔹", type: "EIGHTEEN_INCOMPATIBLES", note: "乌头反白蔹" },
  { herbA: "乌头", herbB: "白及", type: "EIGHTEEN_INCOMPATIBLES", note: "乌头反白及" },
  { herbA: "藜芦", herbB: "人参", type: "EIGHTEEN_INCOMPATIBLES", note: "藜芦反人参" },
  { herbA: "藜芦", herbB: "沙参", type: "EIGHTEEN_INCOMPATIBLES", note: "藜芦反沙参" },
  { herbA: "藜芦", herbB: "丹参", type: "EIGHTEEN_INCOMPATIBLES", note: "藜芦反丹参" },
  { herbA: "藜芦", herbB: "玄参", type: "EIGHTEEN_INCOMPATIBLES", note: "藜芦反玄参" },
  { herbA: "藜芦", herbB: "苦参", type: "EIGHTEEN_INCOMPATIBLES", note: "藜芦反苦参" },
  { herbA: "藜芦", herbB: "细辛", type: "EIGHTEEN_INCOMPATIBLES", note: "藜芦反细辛" },
  { herbA: "藜芦", herbB: "芍药", type: "EIGHTEEN_INCOMPATIBLES", note: "藜芦反芍药" },
  // 十九畏
  { herbA: "硫黄", herbB: "朴硝", type: "NINETEEN_ANTAGONISMS", note: "硫黄畏朴硝" },
  { herbA: "水银", herbB: "砒霜", type: "NINETEEN_ANTAGONISMS", note: "水银畏砒霜" },
  { herbA: "狼毒", herbB: "密陀僧", type: "NINETEEN_ANTAGONISMS", note: "狼毒畏密陀僧" },
  { herbA: "巴豆", herbB: "牵牛", type: "NINETEEN_ANTAGONISMS", note: "巴豆畏牵牛" },
  { herbA: "丁香", herbB: "郁金", type: "NINETEEN_ANTAGONISMS", note: "丁香畏郁金" },
  { herbA: "川乌", herbB: "犀角", type: "NINETEEN_ANTAGONISMS", note: "川乌畏犀角" },
  { herbA: "牙硝", herbB: "三棱", type: "NINETEEN_ANTAGONISMS", note: "牙硝畏三棱" },
  { herbA: "官桂", herbB: "赤石脂", type: "NINETEEN_ANTAGONISMS", note: "官桂畏赤石脂" },
  { herbA: "人参", herbB: "五灵脂", type: "NINETEEN_ANTAGONISMS", note: "人参畏五灵脂" },
];

async function main() {
  console.log("Seeding database...");

  // Create demo users
  const passwordHash = await bcrypt.hash("123456", 12);

  await prisma.user.upsert({
    where: { phone: "13800000001" },
    update: {},
    create: {
      name: "张三",
      phone: "13800000001",
      passwordHash,
      role: "PATIENT",
    },
  });

  await prisma.user.upsert({
    where: { phone: "13800000002" },
    update: {},
    create: {
      name: "李医生",
      phone: "13800000002",
      passwordHash,
      role: "DOCTOR",
    },
  });

  await prisma.user.upsert({
    where: { phone: "13800000000" },
    update: {},
    create: {
      name: "管理员",
      phone: "13800000000",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Created demo users (patient, doctor, admin)");

  // Seed default AI config
  await prisma.aiConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      enabled: false,
      provider: "openai",
      model: "gpt-4o",
      apiKey: "",
      baseUrl: "",
      temperature: 0.7,
      maxTokens: 2048,
      systemPrompt: "",
    },
  });
  console.log("Created default AI config (disabled)");

  // Seed herbs
  for (const herb of HERBS) {
    await prisma.herb.upsert({
      where: { name: herb.name },
      update: herb,
      create: herb,
    });
  }
  console.log(`Seeded ${HERBS.length} herbs`);

  // Seed incompatible pairs
  await prisma.incompatiblePair.deleteMany();
  for (const pair of INCOMPATIBLE_PAIRS) {
    await prisma.incompatiblePair.create({ data: pair });
  }
  console.log(`Seeded ${INCOMPATIBLE_PAIRS.length} incompatible pairs`);

  console.log("Seeding complete!");
  console.log("\nDemo accounts:");
  console.log("  Admin:   13800000000 / 123456");
  console.log("  Patient: 13800000001 / 123456");
  console.log("  Doctor:  13800000002 / 123456");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
