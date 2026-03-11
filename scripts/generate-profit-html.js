const fs = require('fs');
const crypto = require('crypto');

const products = [
  {
    name: 'カプコン モンスターハンター デフォルメ ぬいぐるみ エスピナス モンハン【未開封】',
    price: 14800, cost: 5500, shipping: 750, profit: 7070,
    explanation: [
      '■デフォルメぬいぐるみのリサーチポイント',
      'デフォルメぬいぐるみの稀少性と未開封っぽい状態、この2つが揃ってたのでリサーチしました。過去に14,000円台の出品履歴があったので、そこを参考に14,800円で値付けしてます。',
      '<strong>1. 未開封かどうかで全然違う</strong><br>袋なしタグ付きとかの開封品だと1万円以下が多いんですよね。<strong>未開封相当かどうかで価格差がめちゃくちゃ出る</strong>ジャンルです。今回は未開封っぽい状態だったので過去最高値を参考にしました。',
      '<strong>2. デフォルメぬいぐるみは全体的に高値傾向</strong><br>ぶっちゃけデフォルメぬいぐるみって高い傾向がありますね。<strong>見かけたらとりあえずリサーチ</strong>する方針で問題ないかなと思ってます。',
    ],
    comment: '過去最高値を参考に14,800円で値付け！デフォルメぬいは見つけたら即リサーチ！！',
  },
  {
    name: 'かにぱんポーチ',
    price: 1498, cost: 110, shipping: 220, profit: 1019,
    explanation: [
      '■ファン層がいるのに商品化が少ないジャンル',
      '110円仕入れで約1,000円利益。まぁ単価は低いんですけど、こういうのめちゃくちゃ好きです笑　1,000円前後の出品が多くて、約2ヶ月で売れました。',
      '<strong>1. 需要はあるのに供給が少ない＝値段がつきやすい</strong><br>かにぱんって、ファン層は確実にいるのに公式グッズの商品化がほとんどないんですよね。<strong>こういう「需要はあるけど供給が少ない」ジャンルは値段つきやすい</strong>です。回転も速めなので見つけたら拾っておくのがおすすめですね。',
    ],
    comment: '110円→1,000円利益！ファンはいるのにグッズ化されてない商品は狙い目です！！',
  },
  {
    name: '【タグ付き/美品】からめる 特大サイズ やわらかもっち～り ぬいぐるみ ペンギン 約50cm',
    price: 3000, cost: 220, shipping: 850, profit: 1630,
    explanation: [
      '■SNS認知があるキャラクターのぬいぐるみ',
      'ブックオフのカゴに入ってたのを220円で拾いました。からめるってキャラクター、SNS等で認知のある緩めキャラクターなんですよね。プライズの供給は頻繁なんですけど、ぬいぐるみの需要は意外と堅調です。',
      '<strong>1. カゴ品220円→3,000円は十分すぎる</strong><br>220円仕入れで1,630円利益。<strong>プライズ品でも需要があるキャラクターなら全然利益出ます</strong>。',
      '<strong>2. ぬいぐるみの発送は防水が基本</strong><br>保管は透明袋で十分なんですけど、発送は<strong>ポリ袋で防水してからダンボールに入れる</strong>のが基本ですね。クレーム防止のためにもここは手を抜かないほうがいいです。',
    ],
    comment: 'カゴ品220円から拾えると利益率えっぐいです笑',
  },
  {
    name: 'TARGET THE MIRACLE G7 鈴木未来モデル ダーツ',
    price: 14000, cost: 6490, shipping: 520, profit: 5590,
    explanation: [
      '■コラボ系ダーツのリサーチと出品ポイント',
      'コラボ系のダーツは見かけたら必ずリサーチするようにしてます。今回は鈴木未来選手のプロモデルで、かなり状態が良かったんですよね。',
      '<strong>1. 状態表示は断定を避ける</strong><br>ほぼ未使用っぽかったんですけど、断定は避けて「非常に状態良好、未使用かと思います」と記載しました。<strong>先端など詳細写真で補足して、購入者が納得できるように</strong>してます。状態の断定は後々トラブルになりかねないので。',
      '<strong>2. 履歴が少ない銘柄は相場が読みにくい</strong><br>正直、履歴が少ない銘柄だと最新相場が読みにくくて痛い目を見たことあります笑　<strong>できるだけ取引履歴が多い個体を優先</strong>したほうがいいかなと。',
      '<strong>3. 同モデルでもグラム違いがある</strong><br>ダーツって同じモデルでもグラム違いがあるんですよね。<strong>重量とかスペックはしっかり明記</strong>しておくのが重要です。',
    ],
    comment: 'コラボ系ダーツは穴場！ただし履歴少ないと相場読みにくいので注意です',
  },
  {
    name: 'パナソニック Panasonic ストロボ スピードライト フラッシュ PE-28S',
    price: 4000, cost: 550, shipping: 750, profit: 2300,
    explanation: [
      '■「廃盤＝高い」とは限らないパターン',
      '廃盤品なんですけど、正直コレクター需要がそこまで強くないんですよね。<strong>後継機の質が向上しているので、旧型の価格が上がらないケース</strong>です。約4,000円相場で、使われた形跡なしの美品〜未使用に近い状態で販売しました。',
      '<strong>1. 後継機の有無で相場が変わる</strong><br>廃盤だからといって飛びつくと失敗します。<strong>後継機があるかどうかは事前にリサーチ必須</strong>ですね。値付けはウォークファンとかを参考にしてます。今回は状態が良かったのでなんとか利益出ましたけど、事前リサーチなしだと危ないジャンルです。',
    ],
    comment: '廃盤＝プレミアとは限らない！後継機があると相場上がりにくいです',
  },
  {
    name: '勝男 だるま男児 だる丸ウルトラBIG ぬいぐるみ',
    price: 4600, cost: 330, shipping: 1050, profit: 2760,
    explanation: [
      '■季節需要を狙った「高値置き＋待機」',
      '2025年10月に330円で仕入れて、翌年2月後半に4,600円で売れました。ぶっちゃけ非シーズンは全然回りが鈍かったです笑',
      '<strong>1. ダルマ系は受験期（2〜3月）に需要が顕在化する</strong><br>受験シーズンに需要が出てくるので、<strong>最安相場に合わせずに過去最高相場基準で「高値置き」</strong>するのが正解ですね。仕入れ値が安い前提なら、2月まで待つのが鉄板です。',
      '<strong>2. にゃんこ先生ダルマでも同じパターン</strong><br>夏目友人帳のにゃんこ先生ダルマも約4,000円で販売した実績あります。<strong>ダルマ系は季節来るまで待つ</strong>、これですね。',
    ],
    comment: '330円仕入れで2,760円利益！季節需要の高値置きは仕入れ値が安いと強い！！',
  },
  {
    name: '【箱付き】プラレール シンカリオン DXS101 E5はやぶさMkⅡ マーク2',
    price: 19800, cost: 4400, shipping: 1050, profit: 12370,
    explanation: [
      '■プレイバリューが高いおもちゃは子供需要が強い',
      'シンカリオンの初代はやぶさMkⅡ。ほぼ未使用相当の状態で見つけました。シール未貼付で傷もなかったんですけど、説明書に汚れがあったので完全未使用とは断定しませんでした。',
      '<strong>1. 合体機能＝プレイバリューの高さが直結</strong><br>他の機体と合体できる機能があって、<strong>プレイバリューが高い商品は子供需要が根強い</strong>んですよね。初代作品はサブスクでも見られるので、継続的な需要があります。',
      '<strong>2. 写真で状態訴求→約2万円で売却</strong><br>写真でしっかり状態を訴求して約2万円で売りました。購入者さんから「子供用に探してた」って好意的なフィードバックもらえて嬉しかったですね。<strong>初期品は希少化してるので、良状態なら強気の高値売り</strong>推奨です。',
    ],
    comment: '4,400円→19,800円！！初期品の良状態は強気でいけます！！',
  },
  {
    name: 'PENTAX Optio A20 10メガピクセル カメラ 稼働品',
    price: 5000, cost: 2200, shipping: 220, profit: 2080,
    explanation: [
      '■ジャンクコーナーでも付属品完備なら拾う',
      'ジャンクコーナーのショーケースから拾いました。画面にチラつきはあったんですけど、付属品が多数で訴求力ありだったんですよね。',
      '<strong>1. オークション不成立→価格調整で対応</strong><br>最初オークション形式で高値狙いしたんですけど不成立。価格調整して5,000円で売却しました。2,200円仕入れで送料考慮後の利益は約2,000円。<strong>動作品かつ付属完備で差別化可能なら、ジャンク棚でも拾う価値あり</strong>ですね。',
    ],
    comment: 'ジャンク棚でも付属品揃ってて動作品なら全然勝負できます！',
  },
  {
    name: 'キングダムハーツ 一番くじ A賞 ラストワン賞 ソラ スタチュー',
    price: 6600, cost: 3300, shipping: 850, profit: 2120,
    explanation: [
      '■一番くじスタチューは半額セールを狙う',
      'ハードオフで50%オフになってたのを3,300円で仕入れました。5,000円以上で動くと判断して仕入れたんですけど、約2,000円利益確保できましたね。',
      '<strong>1. 座りポーズ・椅子付きスタチューは高い</strong><br>スタチュー系で座りポーズとか椅子付きは高い傾向があります。リヴァイのやつとか約8,000円で即売れしたこともありますね。<strong>ポーズや付属物で相場が変わる</strong>ので、そこは見たほうがいいです。',
      '<strong>2. キングダムハーツは海外需要もある</strong><br>海外でも人気のタイトルなので、<strong>供給タイミング次第で相場が上がりやすい</strong>ですね。半額セールで拾えたらラッキーです。',
    ],
    comment: 'ハードオフの半額セールは一番くじの宝庫です！！',
  },
  {
    name: '一番くじ ドラゴンボール 40th F賞 ACLLECT 鳥山明 シークレット',
    price: 2000, cost: 220, shipping: 220, profit: 1360,
    explanation: [
      '■一番くじ F賞でもシークレット枠は別格',
      '220円仕入れで1,360円利益。正直F賞って安いイメージあるかもしれないんですけど、シークレット枠は話が別なんですよね。',
      '<strong>1. プリズム加工が価格要因</strong><br>今回のシークレットは一貫表紙デザインで、プリズム加工がされてるやつが最高値帯です。<strong>加工の違いで価格が全然変わる</strong>ので、ここは見逃さないようにしてます。',
      '<strong>2. 仕入れ基準を決めておく</strong><br>僕の基準だと、未開封なら220円で拾う。開封品は100円まで。あと<strong>上位賞が話題になってるくじは下位賞の相場も連動して上がりやすい</strong>ので、そこも判断材料にしてますね。',
    ],
    comment: '220円で1,360円利益！シークレット枠は侮れない！！',
  },
  {
    name: 'ASTRO C40TR Gaming PS4 コントローラー',
    price: 8000, cost: 3520, shipping: 750, profit: 3330,
    explanation: [
      '■短期の相場下落に過剰反応しない',
      '正直この商品、仕入れた時点では美品8,000円の履歴があったんですけど、直後に相場が4,000円くらいまで下がって損切り考えたんですよね笑　で、出品を忘れてたら、Yahoo!フリマで8,000円で売れました。',
      '<strong>1. 新品在庫枯渇で中古美品の価値が上がった</strong><br>仕入れた10月時点で新品は3万円弱。その後1月頃に新品在庫が切れて約4万円に上昇、そこから3万5千円くらいに落ち着きました。29,000円がたまに出るけどすぐ消える状況で、<strong>新品在庫が枯渇した影響で中古美品の相対価値が上がって売れた</strong>っぽいですね。箱付き美品の需要にハマったかなと。',
      '<strong>2. カート取得による相場牽引は一時的</strong><br>12月に3万円弱の出品者がカートを取得して相場が一時的に下がったんですけど、<strong>そういうのは一時的</strong>なので。継続ウォッチで回復局面を捉えるのが大事ですね。美品を見つけたら<strong>強気の価格設定で「高値置き＋待機」</strong>が成立し得ます。',
    ],
    comment: '出品忘れてたら勝手に相場回復して売れた笑　高値置き＋待機は正義です',
  },
  {
    name: 'Newニンテンドー3DS ブラック',
    price: 21500, cost: 12742, shipping: 520, profit: 7163,
    explanation: [
      '■ゲオ仕入れのポイントと販路選び',
      'ゲオは状態を考慮した値引きがあるので、入荷が多いのにライバルが少ない店舗だと在庫が残ってたりするんですよね。',
      '<strong>1. 3DSは12,000円なら安いという基準</strong><br><strong>12,000円以下なら安い</strong>って基準を持っておくと判断が早いですね。今回は12,742円仕入れでギリギリでしたけど、21,500円で売れたので7,163円利益。',
      '<strong>2. ゲーム機は手数料5%のPayPayフリマが好適</strong><br>ゲーム機は回転が早いので、<strong>手数料5%のPayPayフリマ</strong>で出してます。ただPC出品できないのがめんどくさいんですよね笑',
    ],
    comment: 'ゲーム機は回転早い！PayPayフリマで手数料5%に抑えるのがコツです！',
  },
  {
    name: 'DXオーマジオウライドウォッチ 仮面ライダージオウ',
    price: 1980, cost: 330, shipping: 220, profit: 1232,
    explanation: [
      '■プレバン限定品のプレミア化パターン',
      'プレミアムバンダイの抽選販売品ですね。定価2,200円のライドウォッチが、Amazonだと約5,700円まで上がってます。',
      '<strong>1. ラスボスアイテム＋限定流通＝プレミア化</strong><br>ジオウのラスボスであるオーマジオウの音声が入ったライドウォッチで、<strong>ブラック×ゴールドのカラーリングが終盤アイテムの特別感</strong>を出してますね。こういうのは需要が残りやすいです。',
      '<strong>2. 限定色・限定流通は希少化のシグナル</strong><br>抽選販売ってことは予約が少ない＝生産数が少ないんですよね。<strong>限定色や限定流通のアイテムは希少化しやすい</strong>ので、見つけたら要チェックです。',
    ],
    comment: '330円仕入れで1,232円利益！プレバン限定品は安く見つけたら即買い！！',
  },
  {
    name: 'final TONALITE ワイヤレスイヤホン',
    price: 32000, cost: 16390, shipping: 750, profit: 13260,
    explanation: [
      '■セカストの「商圏差」を突く仕入れ',
      '公式で4万円する現行品のイヤホンが、セカストで16,300円。美品だったので32,000円で売却しました。新品半値のセオリーに沿った値付けですね。',
      '<strong>1. マイナー銘柄はセカストで安く出がち</strong><br>セカストってAppleとかSonyみたいな定番ブランドは強気価格なんですけど、<strong>finalみたいなマイナー銘柄は近隣に需要がないと判断して安く出す</strong>ことが多いんですよね。でもネット市場だと全然高く売れるので、この商圏差を突けるのがめちゃくちゃ強みです。',
      '<strong>2. 状態良好なら強気でいける</strong><br>美品だったのでそのまま公式の8割くらいで値付けしました。<strong>状態良好なマイナーブランド品は、セカストの商圏差で一番おいしいパターン</strong>かなと思ってます。',
    ],
    comment: 'セカストのマイナーブランドは穴場！商圏差で13,260円利益！！',
  },
  {
    name: 'アブガルシア アンバサダー ファイブスター ベイトリール',
    price: 11300, cost: 4390, shipping: 750, profit: 5595,
    explanation: [
      '■「アンバサダー」は無条件リサーチのキーワード',
      'アブガルシアのアンバサダーは、見つけたら無条件でリサーチしてます。正直、僕自身は釣り具にそこまで詳しくないんですけど笑',
      '<strong>1. 海外本社閉鎖で全シリーズ廃盤化</strong><br>海外の本社が閉鎖になって、製造中止でシリーズが軒並み廃盤になってるんですよね。<strong>なので「アンバサダー」ってキーワードだけ覚えておけば、詳しくなくてもとりあえずリサーチできます</strong>。',
      '<strong>2. 廃盤シリーズはアラート設定レベルの重要トリガー</strong><br>こういう<strong>廃盤シリーズやコラボキーワードは、アラート設定するくらいの重要トリガー</strong>ですね。覚えておくだけで勝てるキーワードってのは存在するので。',
    ],
    comment: 'アンバサダーは覚えておくだけで勝てるキーワード！！',
  },
  {
    name: 'Panasonic VL-SWE310KLA インターホン',
    price: 23500, cost: 14190, shipping: 850, profit: 7285,
    explanation: [
      '■工事系商品は商圏差の宝庫',
      'Amazon相場が29,000円のインターホン。<strong>工事系の商品って店頭で買われにくい</strong>ので、商圏差で安く置かれがちなんですよね。フリマ→Amazon転売の仕入対象として人気のジャンルです。',
      '<strong>1. 販路は手数料と回転を考慮して選ぶ</strong><br>新品扱いにしたくない小物はフリマ相場で売るのが基本ですけど、<strong>爆速で売れる商品や買取前提なら手数料を加味してYahoo!フリマが有利</strong>な場合もありますね。',
      '<strong>2. PayPayフリマの10%ポイントバック</strong><br>PayPayフリマは<strong>24時間以内販売で購入者に10%ポイントバック</strong>がつくので、回転促進に使えます。高額商品だと購入者側のメリットも大きいので、売れやすくなりますね。',
    ],
    comment: '工事系は店頭スルーされがち＝仕入れのチャンスです！！',
  },
  {
    name: '【美品】CSM 戦極ドライバー プロジェクト・アークEDITION イエロー',
    price: 21000, cost: 11880, shipping: 1050, profit: 7020,
    explanation: [
      '■CSM系は美品なら安定して利益が出る',
      'CSM（Complete Selection Modification）のプレバン限定品ですね。美品だったのでYahoo!フリマで21,000円で出しました。',
      '<strong>1. CSMは状態で価格差がかなり出る</strong><br>CSM系って変身ベルトのハイエンドラインなので、<strong>コレクター需要がめちゃくちゃ強い</strong>んですよね。状態が良ければ良いほど高く売れるジャンルなので、美品を見つけたら即リサーチです。',
    ],
    comment: 'CSM系は状態良ければ安定して利益出ますね！',
  },
  {
    name: '【セット】鬼滅の刃 アートコースター 第一弾 BOX 未開封 全45種 ジャンプショップ限定',
    price: 100000, cost: 48900, shipping: 750, profit: 40350,
    explanation: [
      '■ジャンプショップ限定品のリサーチと販売',
      'このアートコースターBOXと、もう一つ原画展限定の箔押しイラストカードコレクションをセットで持ってたんですけど、メルカリショップに置いてたら代行業者さんが「まとめて売ってくれない？」って言ってきたので、セットで売った商品ですね。Xにも載せました。',
      '<strong>1. ジャンプショップのゲリラ販売に注意</strong><br>アートコースターのBOXって、<strong>ジャンプショップでゲリラ的に定価販売されてる</strong>らしいんですよね。なのでその辺を考慮しないで仕入れたのはちょっと危なかったかなとは思ってます。とはいえ22,000円で仕入れて相場4万円くらいだったので、まぁいいでしょうと。',
      '<strong>2. 鬼滅は映画3部作で全体の盛り上がりが続いている</strong><br>鬼滅の刃の3部作映画が公開中で、2本目の公開も控えてるので、<strong>全体的な盛り上がりがずっと高まってる</strong>感じなんですよね。過去に販売された商品がじわじわ上がっていって、店舗に置かれてる価格から1ヶ月経ったら差額取れるくらい変動してることもまぁまぁあります。',
      '<strong>3. ショップ限定品はリサーチ向き</strong><br><strong>ショップ限定みたいなやつはリサーチしていくと利益商品が見つかりやすい</strong>んじゃないかなと思いますね。特に鬼滅は今のタイミングだとかなり楽しいです。',
    ],
    comment: '代行業者さんからまとめ買い依頼きました！鬼滅のショップ限定品は今アツい！！',
  },
  {
    name: 'リュウケンドー マダンキー 6本',
    price: 10000, cost: 5060, shipping: 220, profit: 3720,
    explanation: [
      '■マダンキーの仕入れ・販売ポイント',
      'プレイバリューとはちょっと違うんですけど、キーを押した時にバネで鍵が出てくる感じがすごいんですよね。押し心地もいいですし、地味におもちゃなのにステンレスか鉄かわかんないですけど、<strong>ああいう金属素材を使っているのはかなりポイントが高い</strong>商品かなと思ってて。今後も需要は残ってくる商品だと思います。',
      '<strong>1. ヤフオク→メルカリショップで即売れ</strong><br>なんで1万円で売れたかというと、相場が上がってたんですよね。1本2,000円くらいだったらセット品としては問題なく需要あるかなと思って、最初ヤフオクに1万円スタートのオークションで出したんですけど、全く売れなくて。メルカリショップに移動したら<strong>1万円ですぐ売れちゃいました</strong>。客層考慮すると12,000円でも売れるポテンシャルはあったかなと思います。',
      '<strong>2. 単体で高額なキーもある</strong><br>リュウケンドーのマダンキーの中でも、単体で4,000〜6,000円くらいで売れるものもあるんですよね。なので仕入れる機会があったら、<strong>高いマダンキーなのかどうかの判断はしたほうがいい</strong>かなと思います。その方が損しないので。',
    ],
    comment: '金属素材でクオリティ高い！客層的にメルカリショップのほうが合ってました！！',
  },
  {
    name: '不死川玄弥 誕生祭 鬼滅の刃 2024 cafe マチ アソビ ケーキ型 アクリルスタンド ufotable ダイニング',
    price: 11000, cost: 6600, shipping: 220, profit: 3080,
    explanation: [
      '■限定アクスタの仕入れ判断と販路選び',
      'これ、2024年のバースデー限定グッズなんですよね。おそらく市場在庫がないのであれば、きっと相場は上がっているだろうと思って仕入れました。',
      '<strong>1. メルカリで見つからない→Googleレンズが根拠になる</strong><br>メルカリでキーワード検索しても同じのが出てこなかったんですけど、<strong>Googleレンズには1万いくらで売れてる履歴があった</strong>ので、そこを根拠に仕入れました。フリマに在庫がないときはGoogleレンズ頼りですね。',
      '<strong>2. ヤフオクよりメルカリショップが強い理由</strong><br>ヤフオクに1回出したんですけど入札なくて、メルカリショップに出したら秒でなくなりました笑　<strong>中国からの需要が高いんで、代行業者の都合上メルカリのほうが買われやすい</strong>んじゃないかなと思いますね。メルカリのオークションに出せれば一番良かったんですけど、事業者として情報発信もやってる都合上、メルカリは積極的には使わない方がいいかなと。',
      '<strong>3. 反応するポイントは「限定」×「年数」×「クオリティ」</strong><br>2024年、つまり2年前の商品で、誕生祭グッズ。カフェ限定で、デザインがかなり良くて、<strong>アクリルスタンドというよりジオラマっぽい感じ</strong>でケーキとかロウソクとか細かいパーツがいっぱいある感じなので、かなりクオリティ高い商品でしたね。ちょっと古い鬼滅の刃グッズは限定だったら相場上がってくるので、リサーチおすすめです。',
    ],
    comment: '在庫希薄な限定品はGoogleレンズでリサーチ！中国需要も見逃せない！！',
  },
];

function genId() {
  return 'id-' + crypto.randomUUID();
}

function escJson(s) {
  return s.replace(/--/g, '\\u002d\\u002d');
}

function buildProduct(p) {
  const blockId = genId();
  const lines = [];

  // H2
  lines.push(`<!-- wp:sgb/headings {"headingText":"${p.name}","headingStyle":"hh hh8","headingIconName":"","headingIconColor":"#333","headingBgColor1":"whitesmoke","headingBorderColor1":"var(${escJson('--sgb-main-color')})"} -->`);
  lines.push(`<h2 class="wp-block-sgb-headings sgb-heading"><span class="sgb-heading__inner hh hh8" style="background-color:whitesmoke;border-color:var(--sgb-main-color);font-size:1.2em"><span class="sgb-heading__text" style="color:#333">${p.name}</span></span></h2>`);
  lines.push(`<!-- /wp:sgb/headings -->`);
  lines.push('');

  // Image
  lines.push(`<!-- wp:image {"id":0,"sizeSlug":"large","linkDestination":"none"} -->`);
  lines.push(`<figure class="wp-block-image size-large"><img src="" alt="" class="wp-image-0"/></figure>`);
  lines.push(`<!-- /wp:image -->`);
  lines.push('');

  // Table with full CSS
  const cssBlock = `/* 右線 */\\ntable tr td {\\n\\tborder-right: 0 !important;\\n}\\n\\n/* 太さ調整 */\\ntable td, table th {\\n\\tborder: 1px solid var(\\u002d\\u002dsgb-main-color) !important;\\n\\tborder-width: 1px !important;\\n}\\n\\ntable tr th:first-child,\\ntable tr td:first-child {\\n\\tborder-bottom: 2px solid #fff !important;\\n\\twidth: calc(var(\\u002d\\u002dsgb\\u002d\\u002dcustom\\u002d\\u002dtd-width)*1px);\\n}\\n\\n/* 色調整 */\\ntable tr:last-child td {\\n\\tborder-color: var(\\u002d\\u002dsgb-main-color) !important;\\n}\\n\\n/* 角丸調整 */\\ntable tr:first-child td:last-child {\\n\\tborder-top-right-radius: calc(var(\\u002d\\u002dsgb\\u002d\\u002dcustom\\u002d\\u002dbox-radius, 6)* 1px);\\n\\tborder-top: 0 !important;\\n}\\n\\ntable tr:last-child td:last-child {\\n\\tborder-bottom-right-radius: calc(var(\\u002d\\u002dsgb\\u002d\\u002dcustom\\u002d\\u002dbox-radius, 6) * 1px);\\n\\tborder-bottom: 0 !important;\\n}\\n\\n\\n.sng-inline-btn {\\n\\tfont-size: 12px;\\n}\\n\\n.scroll-hint-icon-wrap {\\n\\tz-index: 10;\\n}\\n\\ntable {\\n\\tborder-collapse: separate;\\n\\tborder-spacing: 0;\\n\\tborder-radius: calc(var(\\u002d\\u002dsgb\\u002d\\u002dcustom\\u002d\\u002dbox-radius)*1px);\\n}`;

  const scopedCSS = `\\n#${blockId} table tr td {\\n\\tborder-right: 0 !important;\\n}\\n\\n\\n#${blockId} table td,#${blockId}  table th {\\n\\tborder: 1px solid var(\\u002d\\u002dsgb-main-color) !important;\\n\\tborder-width: 1px !important;\\n}\\n\\n#${blockId} table tr th:first-child,\\n#${blockId} table tr td:first-child {\\n\\tborder-bottom: 2px solid #fff !important;\\n\\twidth: calc(var(\\u002d\\u002dsgb\\u002d\\u002dcustom\\u002d\\u002dtd-width)*1px);\\n}\\n\\n\\n#${blockId} table tr:last-child td {\\n\\tborder-color: var(\\u002d\\u002dsgb-main-color) !important;\\n}\\n\\n\\n#${blockId} table tr:first-child td:last-child {\\n\\tborder-top-right-radius: calc(var(\\u002d\\u002dsgb\\u002d\\u002dcustom\\u002d\\u002dbox-radius, 6)* 1px);\\n\\tborder-top: 0 !important;\\n}\\n\\n#${blockId} table tr:last-child td:last-child {\\n\\tborder-bottom-right-radius: calc(var(\\u002d\\u002dsgb\\u002d\\u002dcustom\\u002d\\u002dbox-radius, 6) * 1px);\\n\\tborder-bottom: 0 !important;\\n}\\n\\n\\n#${blockId} .sng-inline-btn {\\n\\tfont-size: 12px;\\n}\\n\\n#${blockId} .scroll-hint-icon-wrap {\\n\\tz-index: 10;\\n}\\n\\n#${blockId} table {\\n\\tborder-collapse: separate;\\n\\tborder-spacing: 0;\\n\\tborder-radius: calc(var(\\u002d\\u002dsgb\\u002d\\u002dcustom\\u002d\\u002dbox-radius)*1px);\\n}`;

  const customControls = JSON.stringify([{"name":"角丸の大きさ(px)","variableName":"boxRadius","defaultValue":"","defaultType":"string","dateFormat":"","useTextarea":false,"useRadio":false,"useCheckbox":false,"useQuotation":false,"options":[],"min":1,"max":20,"step":1,"label":"","variableType":"number","disableJS":true,"value":6},{"name":"見出しのwidth","variableName":"tdWidth","defaultValue":"","defaultType":"string","dateFormat":"","useTextarea":false,"useRadio":false,"useCheckbox":false,"useQuotation":false,"options":[],"min":0,"max":1000,"step":1,"label":"","variableType":"number","disableJS":true,"value":170}]);

  lines.push(`<!-- wp:table {"hasFixedLayout":false,"className":"is-style-regular","borderColor":"var(\\u002d\\u002dsgb-main-color)","headingFirstCol":true,"headingColor":"#ffffff","headingBgColor":"var(\\u002d\\u002dsgb-main-color)","css":"${cssBlock}","scopedCSS":"${scopedCSS}","blockId":"${blockId}","customControls":${customControls}} -->`);
  lines.push(`<figure class="wp-block-table is-style-regular"><table class="has-border-color has-var-sgb-main-color-border-color"><tbody><tr><td class="has-text-align-center" data-align="center">販売価格</td><td>${p.price}円</td></tr><tr><td class="has-text-align-center" data-align="center">仕入れ値</td><td>${p.cost}円</td></tr><tr><td class="has-text-align-center" data-align="center">送料</td><td>${p.shipping}円</td></tr><tr><td class="has-text-align-center" data-align="center">利益</td><td>${p.profit}円</td></tr></tbody></table></figure>`);
  lines.push(`<!-- /wp:table -->`);
  lines.push('');

  // Explanation (Pattern A)
  if (p.explanation) {
    for (const para of p.explanation) {
      lines.push(`<!-- wp:paragraph -->`);
      lines.push(`<p>${para}</p>`);
      lines.push(`<!-- /wp:paragraph -->`);
      lines.push('');
    }
  }

  // Speech bubble
  lines.push(`<!-- wp:sgb/say {"avatarImageUrl":"https://sedorisassa.com/wp-content/uploads/2025/06/7F59A966-41F0-4707-8AA2-E61F36422128.png","avatarName":"さっさ"} -->`);
  lines.push(`<div class="wp-block-sgb-say"><div class="sgb-block-say sgb-block-say--left"><div class="sgb-block-say-avatar"><img src="https://sedorisassa.com/wp-content/uploads/2025/06/7F59A966-41F0-4707-8AA2-E61F36422128.png" alt="さっさ" width="80" height="80" style="border-color:#eaedf2"/><div class="sgb-block-say-avatar__name">さっさ</div></div><div class="sgb-block-say-text"><div class="sgb-block-say-text__content" style="color:#333;border-color:#d5d5d5;background-color:#FFF"><!-- wp:paragraph -->`);
  lines.push(`<p>${p.comment}</p>`);
  lines.push(`<!-- /wp:paragraph --><span class="sgb-block-say-text__before" style="border-right-color:#d5d5d5"></span><span class="sgb-block-say-text__after" style="border-right-color:#FFF"></span></div></div></div></div>`);
  lines.push(`<!-- /wp:sgb/say -->`);
  lines.push('');

  // Spacer
  lines.push(`<!-- wp:paragraph -->`);
  lines.push(`<p><br><br></p>`);
  lines.push(`<!-- /wp:paragraph -->`);
  lines.push('');

  return lines.join('\n');
}

const output = products.map(buildProduct).join('\n');
fs.writeFileSync('C:/Users/user/ai-skills/output/profit-products-202603.html', output, 'utf-8');
console.log(`Generated ${products.length} products`);
console.log(`File size: ${(Buffer.byteLength(output) / 1024).toFixed(1)} KB`);
