
/* @source ../lib/oz.js */;

/**
 * OzJS: microkernel for modular javascript 
 * compatible with AMD (Asynchronous Module Definition)
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */ 
(function(){

var window = this,
    _toString = Object.prototype.toString,
    _RE_PLUGIN = /(.*)!(.+)/,
    _RE_DEPS = /\Wrequire\((['"]).+?\1\)/g,
    _RE_SUFFIX = /\.(js|json)$/,
    _RE_RELPATH = /^\.+?\/.+/,
    _RE_DOT = /(^|\/)\.\//g,
    _RE_ALIAS_IN_MID = /^([\w\-]+)\//,
    _builtin_mods = { "require": 1, "exports": 1, "module": 1, "host": 1, "finish": 1 },

    _config = {
        mods: {}
    },
    _scripts = {},
    _delays = {},
    _refers = {},
    _waitings = {},
    _latest_mod,
    _scope,
    _resets = {},

    forEach = Array.prototype.forEach || function(fn, sc){
        for(var i = 0, l = this.length; i < l; i++){
            if (i in this)
                fn.call(sc, this[i], i, this);
        }
    };

/**
 * @public define / register a module and its meta information
 * @param {string} module name. optional as unique module in a script file
 * @param {string[]} dependencies 
 * @param {function} module code, execute only once on the first call 
 *
 * @note
 *
 * define('', [""], func)
 * define([""], func)
 * define('', func)
 * define(func)
 *
 * define('', "")
 * define('', [""], "")
 * define('', [""])
 *
 */ 
function define(name, deps, block){
    var is_remote = typeof block === 'string';
    if (!block) {
        if (deps) {
            if (isArray(deps)) {
                block = filesuffix(realname(basename(name)));
            } else {
                block = deps;
                deps = null;
            }
        } else {
            block = name;
            name = "";
        }
        if (typeof name !== 'string') {
            deps = name;
            name = "";
        } else {
            is_remote = typeof block === 'string';
            if (!is_remote && !deps) {
                deps = seek(block);
            }
        }
    }
    name = name && realname(name);
    var mod = name && _config.mods[name];
    if (!_config.debug && mod && mod.name 
            && (is_remote && mod.loaded == 2 || mod.exports)) {
        return;
    }
    if (is_remote && _config.enable_ozma) {
        deps = null;
    }
    var host = isWindow(this) ? this : window;
    mod = _config.mods[name] = {
        name: name,
        url: mod && mod.url,
        host: host,
        deps: deps || []
    };
    if (name === "") { // capture anonymous module
        _latest_mod = mod;
    }
    if (typeof block !== 'string') {
        mod.block = block;
        mod.loaded = 2;
    } else { // remote module
        var alias = _config.aliases;
        if (alias) {
            block = block.replace(/\{(\w+)\}/g, function(e1, e2){
                return alias[e2] || "";
            });
        }
        mod.url = block;
    }
    if (mod.block && !isFunction(mod.block)) { // json module
        mod.exports = block;
    }
}

/**
 * @public run a code block its dependencies 
 * @param {string[]} [module name] dependencies
 * @param {function}
 */ 
function require(deps, block, _self_mod) {
    if (typeof deps === 'string') {
        if (!block) {
            return (_config.mods[realname(basename(deps, _scope))] 
                || {}).exports;
        }
        deps = [deps];
    } else if (!block) {
        block = deps;
        deps = seek(block);
    }
    var host = isWindow(this) ? this : window;
    if (!_self_mod) {
        _self_mod = { url: _scope && _scope.url };
    }
    var m, remotes = 0, // counter for remote scripts
        list = scan.call(host, deps, _self_mod);  // calculate dependencies, find all required modules
    for (var i = 0, l = list.length; i < l; i++) {
        m = list[i];
        if (m.is_reset) {
            m = _config.mods[m.name];
        }
        if (m.url && m.loaded !== 2) { // remote module
            remotes++;
            m.loaded = 1; // status: loading
            fetch(m, function(){
                this.loaded = 2; // status: loaded 
                var lm = _latest_mod;
                if (lm) { // capture anonymous module
                    lm.name = this.name;
                    lm.url = this.url;
                    _config.mods[this.name] = lm;
                    _latest_mod = null;
                }
                // loaded all modules, calculate dependencies all over again
                if (--remotes <= 0) {
                    require.call(host, deps, block, _self_mod);
                }
            });
        }
    }
    if (!remotes) {
        _self_mod.deps = deps;
        _self_mod.host = host;
        _self_mod.block = block;
        setTimeout(function(){
            tidy(deps, _self_mod);
            list.push(_self_mod);
            exec(list.reverse());
        }, 0);
    }
}

/**
 * @private execute modules in a sequence of dependency
 * @param {object[]} [module object]
 */ 
function exec(list){
    var mod, mid, tid, result, isAsync, deps,
        depObjs, exportObj, moduleObj, rmod,
        wt = _waitings;
    while (mod = list.pop()) {
        if (mod.is_reset) {
            rmod = clone(_config.mods[mod.name]);
            rmod.host = mod.host;
            rmod.newname = mod.newname;
            mod = rmod;
            if (!_resets[mod.newname]) {
                _resets[mod.newname] = [];
            }
            _resets[mod.newname].push(mod);
            mod.exports = undefined;
        } else if (mod.name) {
            mod = _config.mods[mod.name] || mod;
        }
        if (!mod.block || !mod.running && mod.exports !== undefined) {
            continue;
        }
        depObjs = [];
        exportObj = {}; // for "exports" module
        moduleObj = { id: mod.name, filename: mod.url, exports: exportObj };
        deps = mod.deps.slice();
        deps[mod.block.hiddenDeps ? 'unshift' : 'push']("require", "exports", "module");
        for (var i = 0, l = deps.length; i < l; i++) {
            mid = deps[i];
            switch(mid) {
                case 'require':
                    depObjs.push(require);
                    break;
                case 'exports':
                    depObjs.push(exportObj);
                    break;
                case 'module':
                    depObjs.push(moduleObj);
                    break;
                case 'host': // deprecated
                    depObjs.push(mod.host);
                    break;
                case 'finish':  // execute asynchronously
                    tid = mod.name;
                    if (!wt[tid]) // for delay execute
                        wt[tid] = [list];
                    else
                        wt[tid].push(list);
                    depObjs.push(function(result){
                        // HACK: no guarantee that this function will be invoked after while() loop termination in Chrome/Safari 
                        setTimeout(function(){
                            // 'mod' equal to 'list[list.length-1]'
                            if (result !== undefined) {
                                mod.exports = result;
                            }
                            if (!wt[tid])
                                return;
                            forEach.call(wt[tid], function(list){
                                this(list);
                            }, exec);
                            delete wt[tid];
                            mod.running = 0;
                        }, 0);
                    });
                    isAsync = 1;
                    break;
                default:
                    depObjs.push((
                        (_resets[mid] || []).pop() 
                        || _config.mods[realname(mid)] 
                        || {}
                    ).exports);
                    break;
            }
        }
        if (!mod.running) {
            // execute module code. arguments: [dep1, dep2, ..., require, exports, module]
            _scope = mod;
            result = mod.block.apply(mod.host, depObjs) || null;
            _scope = false;
            exportObj = moduleObj.exports;
            mod.exports = result !== undefined ? result : exportObj; // use empty exportObj for "finish"
            for (var v in exportObj) {
                if (v) {
                    mod.exports = exportObj;
                }
                break;
            }
        }
        if (isAsync) { // skip, wait for finish() 
            mod.running = 1;
            break;
        }
    }
}

/**
 * @private observer for script loader, prevent duplicate requests
 * @param {object} module object
 * @param {function} callback
 */ 
function fetch(m, cb){
    var url = m.url,
        observers = _scripts[url];
    if (!observers) {
        var mname = m.name, delays = _delays;
        if (m.deps && m.deps.length && delays[mname] !== 1) {
            delays[mname] = [m.deps.length, cb];
            m.deps.forEach(function(dep){
                var d = _config.mods[realname(dep)];
                if (this[dep] !== 1 && d.url && d.loaded !== 2) {
                    if (!this[dep]) {
                        this[dep] = [];
                    }
                    this[dep].push(m);
                } else {
                    delays[mname][0]--;
                }
            }, _refers);
            if (delays[mname][0] > 0) {
                return;
            } else {
                delays[mname] = 1;
            }
        }
        observers = _scripts[url] = [[cb, m]];
        var true_url = /^\w+:\/\//.test(url) ? url 
            : (_config.enable_ozma && _config.distUrl || _config.baseUrl || '') 
                + (_config.enableAutoSuffix ? namesuffix(url) : url);
        getScript.call(m.host || this, true_url, function(){
            forEach.call(observers, function(args){
                args[0].call(args[1]);
            });
            _scripts[url] = 1;
            if (_refers[mname] && _refers[mname] !== 1) {
                _refers[mname].forEach(function(dm){
                    var b = this[dm.name];
                    if (--b[0] <= 0) {
                        this[dm.name] = 1;
                        fetch(dm, b[1]);
                    }
                }, delays);
                _refers[mname] = 1;
            }
        });
    } else if (observers === 1) {
        cb.call(m);
    } else {
        observers.push([cb, m]);
    }
}

/**
 * @private search and sequence all dependencies, based on DFS
 * @param {string[]} a set of module names
 * @param {object[]} 
 * @param {object[]} a sequence of modules, for recursion
 * @return {object[]} a sequence of modules
 */ 
function scan(m, file_mod, list){
    list = list || [];
    if (!m[0]) {
        return list;
    }
    var deps,
        history = list.history;
    if (!history) {
        history = list.history = {};
    }
    if (m[1]) {
        deps = m;
        m = false;
    } else {
        var truename,
            _mid = m[0],
            plugin = _RE_PLUGIN.exec(_mid);
        if (plugin) {
            _mid = plugin[2];
            plugin = plugin[1];
        }
        var mid = realname(_mid);
        if (!_config.mods[mid] && !_builtin_mods[mid]) {
            var true_mid = realname(basename(_mid, file_mod));
            if (mid !== true_mid) {
                _config.mods[file_mod.url + ':' + mid] = true_mid;
                mid = true_mid;
            }
            if (!_config.mods[true_mid]) {
                define(true_mid, filesuffix(true_mid));
            }
        }
        m = file_mod = _config.mods[mid];
        if (m) {
            if (plugin === "new") {
                m = {
                    is_reset: true,
                    deps: m.deps,
                    name: mid,
                    newname: plugin + "!" + mid,
                    host: this
                };
            } else {
                truename = m.name;
            }
            if (history[truename]) {
                return list;
            }
        } else {
            return list;
        }
        if (!history[truename]) {
            deps = m.deps || [];
            // find require information within the code
            // for server-side style module
            //deps = deps.concat(seek(m));
            if (truename) {
                history[truename] = true;
            }
        } else {
            deps = [];
        }
    }
    for (var i = deps.length - 1; i >= 0; i--) {
        if (!history[deps[i]]) {
            scan.call(this, [deps[i]], file_mod, list);
        }
    }
    if (m) {
        tidy(deps, m);
        list.push(m);
    }
    return list;
}

/**
 * @experiment 
 * @private analyse module code 
 *          to find out dependencies which have no explicit declaration
 * @param {object} module object
 */ 
function seek(block){
    var hdeps = block.hiddenDeps || [];
    if (!block.hiddenDeps) {
        var code = block.toString(),
            h = null;
        hdeps = block.hiddenDeps = [];
        while (h = _RE_DEPS.exec(code)) {
            hdeps.push(h[0].slice(10, -2));
        }
    }
    return hdeps.slice();
}

function tidy(deps, m){
    forEach.call(deps.slice(), function(dep, i){
        var true_mid = this[m.url + ':' + realname(dep)];
        if (typeof true_mid === 'string') {
            deps[i] = true_mid;
        }
    }, _config.mods);
}

function config(opt){
    for (var i in opt) {
        if (i === 'aliases') {
            if (!_config[i]) {
                _config[i] = {};
            }
            for (var j in opt[i]) {
                _config[i][j] = opt[i][j];
            }
            var mods = _config.mods;
            for (var k in mods) {
                mods[k].name = realname(k);
                mods[mods[k].name] = mods[k];
            }
        } else {
            _config[i] = opt[i];
        }
    }
}

/**
 * @note naming pattern:
 * _g_src.js 
 * _g_combo.js 
 *
 * jquery.js 
 * jquery_pack.js
 * 
 * _yy_src.pack.js 
 * _yy_combo.js
 * 
 * _yy_bak.pack.js 
 * _yy_bak.pack_pack.js
 */
function namesuffix(file){
    return file.replace(/(.+?)(_src.*)?(\.\w+)$/, function($0, $1, $2, $3){
        return $1 + ($2 && '_combo' || '_pack') + $3;
    });
}

function filesuffix(mid){
    return _RE_SUFFIX.test(mid) ? mid : mid + '.js';
}

function realname(mid){
    var alias = _config.aliases;
    if (alias) {
        mid = mid.replace(_RE_ALIAS_IN_MID, function(e1, e2){
            return alias[e2] || (e2 + '/');
        });
    }
    return mid;
}

function basename(mid, file_mod){
    var rel_path = _RE_RELPATH.exec(mid);
    if (rel_path && file_mod) { // resolve relative path in Module ID
        mid = (file_mod.url || '').replace(/[^\/]+$/, '') + rel_path[0];
    }
    return resolvename(mid);
}

function resolvename(url){
    url = url.replace(_RE_DOT, '$1');
    var dots, dots_n, url_dup = url, RE_DOTS = /(\.\.\/)+/g;
    while (dots = (RE_DOTS.exec(url_dup) || [])[0]) {
        dots_n = dots.match(/\.\.\//g).length;
        url = url.replace(new RegExp('([^/\\.]+/){' + dots_n + '}' + dots), '');
    }
    return url.replace(/\/\//g, '/');
}

/**
 * @public non-blocking script loader
 * @param {string}
 * @param {object} config
 */ 
function getScript(url, op){
    var doc = isWindow(this) ? this.document : document,
        s = doc.createElement("script");
    s.type = "text/javascript";
    s.async = "async"; //for firefox3.6
    if (!op)
        op = {};
    else if (isFunction(op))
        op = { callback: op };
    if (op.charset)
        s.charset = op.charset;
    s.src = url;
    var h = doc.getElementsByTagName("head")[0];
    s.onload = s.onreadystatechange = function(__, isAbort){
        if ( isAbort || !s.readyState || /loaded|complete/.test(s.readyState) ) {
            s.onload = s.onreadystatechange = null;
            if (h && s.parentNode) {
                h.removeChild(s);
            }
            s = undefined;
            if (!isAbort && op.callback) {
                op.callback();
            }
        }
    };
    h.insertBefore(s, h.firstChild);
}

function isFunction(obj) {
    return _toString.call(obj) === "[object Function]";
}

function isArray(obj) {
    return _toString.call(obj) === "[object Array]";
}

function isWindow(obj) {
    return "setInterval" in obj;
}

function clone(obj) { // be careful of using `delete`
    function NewObj(){}
    NewObj.prototype = obj;
    return new NewObj();
}

var oz = {
    VERSION: '2.5.1',
    define: define,
    require: require,
    config: config,
    seek: seek,
    fetch: fetch,
    realname: realname,
    basename: basename,
    filesuffix: filesuffix,
    namesuffix: namesuffix,
    // non-core
    _getScript: getScript,
    _clone: clone,
    _forEach: forEach,
    _isFunction: isFunction,
    _isWindow: isWindow
};

require.config = config;
define.amd = { jQuery: true };

if (!window.window) { // for nodejs
    exports.oz = oz;
    exports._config = _config;
     // hook for build tool
    for (var i in oz) {
        exports[i] = oz[i];
    }
    var hooking = function(fname){
        return function(){ return exports[fname].apply(this, arguments); };
    };
    exec = hooking('exec');
    fetch = hooking('fetch');
    require = hooking('require');
    require.config = config;
} else {
    window.oz = oz;
    window.define = define;
    window.require = require;
}

})();

require.config({ enable_ozma: true });


/* @source mo/domready.js */;

/**
 * Non-plugin implementation of cross-browser DOM ready event
 * Based on OzJS's built-in module -- 'finish'
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/domready", [
  "finish"
], function(finish){
    var loaded, 
        w = this, 
        doc = w.document, 
        ADD = "addEventListener",
        IEADD = "attachEvent",
        READY = "DOMContentLoaded", 
        CHANGE = "onreadystatechange";

    if (doc.readyState === "complete") {
        setTimeout(finish, 1);
    } else {
        if (doc[ADD]){
            loaded = function(){
                doc.removeEventListener("READY", loaded, false);
                finish();
            };
            doc[ADD](READY, loaded, false);
            w[ADD]("load", finish, false);
        } else if (doc[IEADD]) {
            loaded = function(){
                if (doc.readyState === "complete") {
                    doc.detachEvent(CHANGE, loaded);
                    finish();
                }
            };
            doc[IEADD](CHANGE, loaded);
            w[IEADD]("load", finish);
            var toplevel = false;
            try {
                toplevel = w.frameElement == null;
            } catch(e) {}

            if (doc.documentElement.doScroll && toplevel) {
                var check = function(){
                    try {
                        doc.documentElement.doScroll("left");
                    } catch(e) {
                        setTimeout(check, 1);
                        return;
                    }
                    finish();
                };
                check();
            }
        }
    }
});

/* @source ../data/2012.js */;

define("../data/2012", ([
[1, '1.jpg', '碇源堂'], 
[2, '2.jpg', '碇真嗣'], 
[3, '3.jpg', '葛城美里'], 
[4, '4.jpg', '凌波丽'], 
[5, '5.jpg', '明日香'], 
[6, '6.jpg', '真希波.玛丽.伊兰崔亚斯'], 
[7, '7.jpg', '渚熏'], 
[8, '8.jpg', '阿拉蕾'], 
[9, '9.jpg', '则卷宝瓜'], 
[10, '10.jpg', '则卷千兵卫'], 
[11, '11.jpg', '阿童木'], 
[12, '12.jpg', '茶水博士'], 
[13, '13.jpg', '天马博士'], 
[14, '14.jpg', '浅仓南'], 
[15, '15.jpg', '上杉达也'], 
[16, '16.jpg', '上杉和也'], 
[17, '17.jpg', '原田正平'], 
[18, '18.jpg', '大黄蜂'], 
[19, '19.jpg', '红蜘蛛'], 
[20, '20.jpg', '力捷'], 
[21, '21.jpg', '爵士'], 
[22, '22.jpg', '擎天柱'], 
[23, '23.jpg', '声波'], 
[24, '24.jpg', '铁皮'], 
[25, '25.jpg', '威震天'], 
[26, '26.jpg', '震荡波'], 
[27, '27.jpg', '路易'], 
[28, '28.jpg', '马里奥'], 
[29, '29.jpg', '蘑菇王子'], 
[30, '30.jpg', '桃子公主'], 
[31, '31.jpg', '阿土伯'], 
[32, '32.jpg', '大老千'], 
[33, '33.jpg', '金贝贝'], 
[34, '34.jpg', '钱夫人'], 
[35, '35.jpg', '忍太郎'], 
[36, '36.jpg', '沙隆巴斯'], 
[37, '37.jpg', '孙小美'], 
[38, '38.jpg', '乌咪'], 
[39, '39.jpg', '奥利弗'], 
[40, '40.jpg', '大力水手波比'], 
[41, '41.jpg', '白雪公主'], 
[42, '42.jpg', '布鲁托'], 
[43, '43.jpg', '黛丝'], 
[44, '44.jpg', '高飞'], 
[45, '45.jpg', '米奇'], 
[46, '46.jpg', '米妮'], 
[47, '47.jpg', '睡美人'], 
[48, '48.jpg', '唐纳德'], 
[49, '49.jpg', '哆啦A梦'], 
[50, '50.jpg', '哆啦美'], 
[52, '52.jpg', '刚田虎'], 
[53, '53.jpg', '野比大雄'], 
[54, '54.jpg', '野比玉子'], 
[55, '55.jpg', '野比助'], 
[56, '56.jpg', '源静香'], 
[57, '57.jpg', '阿尔冯斯.爱力克'], 
[58, '58.jpg', '爱德华.爱力克'], 
[59, '59.jpg', '金.布拉德雷'], 
[60, '60.jpg', '拉丝特'], 
[61, '61.jpg', '莎莉.霍克爱'], 
[62, '62.jpg', '马斯.休斯'], 
[63, '63.jpg', '瓦特.法尔曼'], 
[64, '64.jpg', '伊兹米.卡迪斯'], 
[65, '65.jpg', '巴特'], 
[66, '66.jpg', '草薙素子'], 
[67, '67.jpg', '荒卷大辅'], 
[69, '69.jpg', '阿丽埃蒂'], 
[70, '70.jpg', '阿珊'], 
[71, '71.jpg', '阿斯贝鲁'], 
[72, '72.jpg', '阿席达卡'], 
[73, '73.jpg', '巴鲁'], 
[74, '74.jpg', '荻野千寻'], 
[75, '75.jpg', '锅炉爷爷'], 
[76, '76.jpg', '哈尔'], 
[77, '77.jpg', '红发少女安妮'], 
[78, '78.jpg', '龙猫'], 
[79, '79.jpg', '魔女琪琪'], 
[80, '80.jpg', '娜乌西卡'], 
[81, '81.jpg', '汤婆婆'], 
[82, '82.jpg', '希达'], 
[83, '83.jpg', '赈早见琥珀主'], 
[84, '84.jpg', '安西光义'], 
[85, '85.jpg', '赤木刚宪'], 
[86, '86.jpg', '赤木晴子'], 
[87, '87.jpg', '宫城良田'], 
[88, '88.jpg', '井上彩子'], 
[89, '89.jpg', '流川枫'], 
[90, '90.jpg', '木暮公延'], 
[91, '91.jpg', '三井寿'], 
[92, '92.jpg', '仙道彰'], 
[93, '93.jpg', '樱木花道'], 
[95, '95.jpg', '白鸽侦探'], 
[96, '96.jpg', '白猫班长'], 
[97, '97.jpg', '大盗贼'], 
[98, '98.jpg', '大脸猫'], 
[99, '99.jpg', '沸羊羊'], 
[100, '100.jpg', '黑猫警长'], 
[101, '101.jpg', '红太狼'], 
[102, '102.jpg', '灰太狼'], 
[103, '103.jpg', '邋遢大王'], 
[104, '104.jpg', '蓝皮鼠'], 
[105, '105.jpg', '美羊羊'], 
[106, '106.jpg', '小灰灰'], 
[107, '107.jpg', '一只耳仓鼠'], 
[108, '108.jpg', '海绵宝宝'], 
[109, '109.jpg', '派大星'], 
[110, '110.jpg', '小蜗'], 
[111, '111.jpg', '蟹老板'], 
[112, '112.jpg', '章鱼哥'], 
[113, '113.jpg', '布鲁克'], 
[114, '114.jpg', '弗兰奇'], 
[115, '115.jpg', '罗罗诺亚.索隆'], 
[116, '116.jpg', '蒙奇.D.路飞'], 
[117, '117.jpg', '娜美'], 
[118, '118.jpg', '妮可.罗宾'], 
[119, '119.jpg', '山治'], 
[120, '120.jpg', '托尼托尼.乔巴'], 
[121, '121.jpg', '乌索普'], 
[122, '122.jpg', '花仙子露露'], 
[123, '123.jpg', '春野樱'], 
[124, '124.jpg', '大蛇丸'], 
[125, '125.jpg', '干柿鬼鲛'], 
[126, '126.jpg', '辉夜君麻吕'], 
[127, '127.jpg', '勘九郎'], 
[128, '128.jpg', '李洛克'], 
[129, '129.jpg', '奈良鹿丸'], 
[130, '130.jpg', '旗木卡卡西'], 
[131, '131.jpg', '千手纲手'], 
[132, '132.jpg', '秋道丁次'], 
[133, '133.jpg', '犬冢牙'], 
[134, '134.jpg', '日向雏田'], 
[135, '135.jpg', '日向宁次'], 
[136, '136.jpg', '山中井野'], 
[137, '137.jpg', '手鞠'], 
[138, '138.jpg', '天天'], 
[139, '139.jpg', '我爱罗'], 
[140, '140.jpg', '漩涡鸣人'], 
[141, '141.jpg', '药师兜'], 
[142, '142.jpg', '油女志乃'], 
[143, '143.jpg', '宇智波鼬'], 
[144, '144.jpg', '宇智波佐助'], 
[145, '145.jpg', '自来也'], 
[146, '146.jpg', '比古清十郎'], 
[147, '147.jpg', '绯村剑心'], 
[148, '148.jpg', '高荷惠'], 
[149, '149.jpg', '卷町操'], 
[150, '150.jpg', '濑田宗次郎'], 
[151, '151.jpg', '明神弥彦'], 
[152, '152.jpg', '神谷熏'], 
[153, '153.jpg', '四乃森苍紫'], 
[154, '154.jpg', '相乐左之助'], 
[155, '155.jpg', '雪代巴'], 
[156, '156.jpg', '雪代缘'], 
[157, '157.jpg', '斋藤一'], 
[158, '158.jpg', '志志雄真实'], 
[159, '159.jpg', '大道世知世'], 
[160, '160.jpg', '李莓铃'], 
[161, '161.jpg', '李小狼'], 
[162, '162.jpg', '木之本桃矢'], 
[163, '163.jpg', '木之本樱'], 
[164, '164.jpg', '小可'], 
[165, '165.jpg', '月城雪兔'], 
[166, '166.jpg', '来生爱'], 
[167, '167.jpg', '来生泪'], 
[168, '168.jpg', '来生瞳'], 
[169, '169.jpg', '内海俊夫'], 
[170, '170.jpg', '爱野美奈子'], 
[171, '171.jpg', '火野丽'], 
[172, '172.jpg', '木野真琴'], 
[174, '174.jpg', '小小兔'], 
[175, '175.jpg', '夜礼服假面'], 
[176, '176.jpg', '月野兔'], 
[177, '177.jpg', '阿笠博士'], 
[179, '179.jpg', '贝尔摩德'], 
[180, '180.jpg', '赤井秀一'], 
[181, '181.jpg', '服部平次'], 
[182, '182.jpg', '工藤新一'], 
[183, '183.jpg', '工藤优作'], 
[184, '184.jpg', '工藤有希子'], 
[185, '185.jpg', '怪盗基德'], 
[186, '186.jpg', '琴酒'], 
[187, '187.jpg', '灰原哀'], 
[188, '188.jpg', '吉田步美'], 
[189, '189.jpg', '江户川柯南'], 
[190, '190.jpg', '铃木园子'], 
[191, '191.jpg', '龙舌兰'], 
[192, '192.jpg', '毛利兰'], 
[193, '193.jpg', '毛利小五郎'], 
[194, '194.jpg', '目暮十三'], 
[195, '195.jpg', '水无怜奈'], 
[196, '196.jpg', '小岛元太'], 
[197, '197.jpg', '英妃理'], 
[198, '198.jpg', '圆谷光彦'], 
[199, '199.jpg', '詹姆斯.布莱克'], 
[200, '200.jpg', '朱蒂.斯泰林'], 
[201, '201.jpg', '巴达克'], 
[202, '202.jpg', '贝吉塔'], 
[203, '203.jpg', '比迪丽'], 
[204, '204.jpg', '布尔玛.布里夫斯 '], 
[205, '205.jpg', '布拉'], 
[206, '206.jpg', '格罗博士'], 
[207, '207.jpg', '龟仙人'], 
[208, '208.jpg', '鹤仙人'], 
[209, '209.jpg', '饺子'], 
[210, '210.jpg', '拉蒂兹'], 
[211, '211.jpg', '兰琪'], 
[212, '212.jpg', '佩佩'], 
[213, '213.jpg', '皮拉夫'], 
[214, '214.jpg', '撒旦先生'], 
[215, '215.jpg', '孙悟饭'], 
[216, '216.jpg', '孙悟天'], 
[217, '217.jpg', '特兰克斯'], 
[218, '218.jpg', '天津饭'], 
[219, '219.jpg', '乌龙'], 
[220, '220.jpg', '小林'], 
[221, '221.jpg', '安迪'], 
[222, '222.jpg', '八神庵'], 
[223, '223.jpg', '拜仁.巴特勒'], 
[224, '224.jpg', '坂崎由莉'], 
[225, '225.jpg', '坂崎良'], 
[226, '226.jpg', '坂崎琢磨'], 
[227, '227.jpg', '不知火舞'], 
[228, '228.jpg', '蔡宝健'], 
[229, '229.jpg', '草薙京'], 
[230, '230.jpg', '陈可汗'], 
[231, '231.jpg', '椎拳崇'], 
[232, '232.jpg', '大门五郎'], 
[233, '233.jpg', '东丈'], 
[234, '234.jpg', '二阶堂红丸'], 
[235, '235.jpg', '哈迪兰'], 
[236, '236.jpg', '金家藩'], 
[237, '237.jpg', '克拉克'], 
[238, '238.jpg', '拉尔夫'], 
[239, '239.jpg', '卢卡尔'], 
[240, '240.jpg', '罗伯特'], 
[241, '241.jpg', '洛奇.古洛巴'], 
[242, '242.jpg', '神乐千鹤'], 
[243, '243.jpg', '特瑞'], 
[244, '244.jpg', '夏尔米'], 
[245, '245.jpg', '镇元斋'], 
[246, '246.jpg', '钢牙'], 
[247, '247.jpg', '琥珀'], 
[248, '248.jpg', '桔梗'], 
[249, '249.jpg', '铃'], 
[250, '250.jpg', '弥勒'], 
[251, '251.jpg', '冥加爷爷'], 
[252, '252.jpg', '奈落'], 
[253, '253.jpg', '七宝'], 
[254, '254.jpg', '犬夜叉'], 
[255, '255.jpg', '日暮戈薇'], 
[256, '256.jpg', '杀生丸'], 
[257, '257.jpg', '珊瑚'], 
[258, '258.jpg', '神乐'], 
[260, '260.jpg', '邪见'], 
[261, '261.jpg', '云母'], 
[262, '262.jpg', '冰河'], 
[263, '263.jpg', '瞬'], 
[264, '264.jpg', '星矢'], 
[265, '265.jpg', '雅典娜'], 
[266, '266.jpg', '一辉'], 
[267, '267.jpg', '紫龙'], 
[268, '268.jpg', '穆法沙'], 
[269, '269.jpg', '辛巴'], 
[270, '270.jpg', '茶渡泰虎'], 
[271, '271.jpg', '黑崎一护'], 
[272, '272.jpg', '井上织姬'], 
[273, '273.jpg', '石田雨龙'], 
[275, '275.jpg', 'L'], 
[276, '276.jpg', '梅罗'], 
[277, '277.jpg', '弥海砂'], 
[278, '278.jpg', '尼亚'], 
[279, '279.jpg', '（死神）琉克'], 
[281, '281.jpg', '汤姆'], 
[282, '282.jpg', '巴斯光年'], 
[284, '284.jpg', '不二周助'], 
[285, '285.jpg', '大石秀一郎'], 
[286, '286.jpg', '乾贞治'], 
[287, '287.jpg', '海堂熏'], 
[288, '288.jpg', '河村隆'], 
[289, '289.jpg', '菊丸英二'], 
[291, '291.jpg', '手冢国光'], 
[292, '292.jpg', '桃城武'], 
[293, '293.jpg', '幸村精市'], 
[294, '294.jpg', '越前龙马'], 
[295, '295.jpg', '阿奴'], 
[296, '296.jpg', '彩依'], 
[297, '297.jpg', '韩梦慈'], 
[298, '298.jpg', '李逍遥'], 
[299, '299.jpg', '林天南'], 
[300, '300.jpg', '林月如'], 
[301, '301.jpg', '刘晋元'], 
[302, '302.jpg', '王小虎'], 
[303, '303.jpg', '赵灵儿'], 
[304, '304.jpg', '坂本辰马'], 
[305, '305.jpg', '坂田银时'], 
[306, '306.jpg', '冲田总悟'], 
[307, '307.jpg', '服部全藏'], 
[308, '308.jpg', '冈田似蔵'], 
[309, '309.jpg', '高杉晋助'], 
[310, '310.jpg', '桂小太郎'], 
[311, '311.jpg', '河上万齐'], 
[312, '312.jpg', '近藤勋'], 
[313, '313.jpg', '来岛又子'], 
[314, '314.jpg', '柳生九兵卫'], 
[315, '315.jpg', '柳生敏木斋'], 
[316, '316.jpg', '土方十四郎'], 
[317, '317.jpg', '伊东鸭太郎'], 
[318, '318.jpg', '长谷川泰三'], 
[319, '319.jpg', '志村妙'], 
[320, '320.jpg', '志村新八'], 
[321, '321.jpg', '藏马'], 
[322, '322.jpg', '飞影'], 
[323, '323.jpg', '牡丹'], 
[324, '324.jpg', '南野秀一'], 
[325, '325.jpg', '浦饭幽助'], 
[326, '326.jpg', '桑原和真'], 
[327, '327.jpg', '小阎王'], 
[328, '328.jpg', '雪村茧子'], 
[329, '329.jpg', '大空翼'], 
[330, '330.jpg', '岬太郎'], 
[331, '331.jpg', '葵新伍'], 
[332, '332.jpg', '日向小次郎'], 
[333, '333.jpg', '若岛津健'], 
[334, '334.jpg', '若林源三'], 
[335, '335.jpg', '三杉淳'], 
[336, '336.jpg', '石崎了'], 
[337, '337.jpg', '松山光'], 
[338, '338.jpg', '中泽旱苗'], 
[339, '339.jpg', '八百鼠'], 
[340, '340.jpg', '独角儿'], 
[341, '341.jpg', '你建一'], 
[342, '342.jpg', '清一色']
]));

/* @source ../pachislot/tpl/export.js */;

define("../pachislot/tpl/export", [], function(){

    return {"template":"\n<div class=\"view export-view\">\n    <fieldset>\n        <legend>导出全部结果</legend>\n        {% records.forEach(function(game){ %}\n            <h6>{%= game.title %}</h6>\n            <p>人数：{%= game.cal %}</p>\n            {% (game.results || []).forEach(function(item){ %}\n            <p>\n                <strong>{%= (item[0]) %}</strong>\n                <span>{%= (item[2]) %}</span>\n            </p>\n            {% }); %}\n        {% }); %}\n    </fieldset>\n    <p class=\"btns\">\n        <input type=\"button\" value=\"返回\" class=\"cancel\">\n    </p>\n</div>\n\n\n\n"}; 

});
/* @source ../pachislot/tpl/load.js */;

define("../pachislot/tpl/load", [], function(){

    return {"template":"\n<form class=\"view save-view\">\n    <fieldset>\n        <legend>读取存档</legend>\n        <ul class=\"select\">\n            {% records.forEach(function(game, i){ %}\n            <li><a href=\"#{%= i %}\" class=\"load-item\">{%= game.title %}</a></li>\n            {% }); %}\n        </ul>\n    </fieldset>\n    <p class=\"btns\">\n        <input type=\"button\" value=\"返回\" class=\"cancel\">\n    </p>\n</form>\n\n\n"}; 

});
/* @source ../pachislot/tpl/save.js */;

define("../pachislot/tpl/save", [], function(){

    return {"template":"\n<form class=\"view save-view\">\n    <fieldset>\n        <legend>保存成功！</legend>\n        <ul class=\"select\">\n            {% records.forEach(function(game){ %}\n            <li><span>{%= game.title %}</span></li>\n            {% }); %}\n        </ul>\n    </fieldset>\n    <p class=\"btns\">\n        <input type=\"button\" value=\"返回\" class=\"cancel\">\n    </p>\n</form>\n\n"}; 

});
/* @source ../pachislot/tpl/new.js */;

define("../pachislot/tpl/new", [], function(){

    return {"template":"\n<form class=\"view new-form\">\n    <fieldset>\n        <legend>创建新抽奖</legend>\n        <p>\n            <label>名称</label>\n            <input type=\"text\" name=\"title\" required placeholder=\"比如：二等奖 - 第三批\">\n        </p>\n        <p>\n            <label>名额</label>\n            <input type=\"number\" name=\"num\" min=\"1\" max=\"10\" step=\"1\" value=\"3\">\n        </p>\n    </fieldset>\n    <p class=\"btns\">\n        <input type=\"submit\" value=\"确定\">\n        <input type=\"button\" value=\"取消\" class=\"cancel\">\n    </p>\n</form>\n"}; 

});
/* @source ../pachislot/tpl/wel.js */;

define("../pachislot/tpl/wel", [], function(){

    return {"template":"\n<div class=\"view wel-view\">\n    <fieldset>\n        <legend>欢迎！</legend>\n        <p class=\"content\">点击NEW按钮新建奖项。或点击LOAD按钮加载奖项。</p>\n    </fieldset>\n</div>\n"}; 

});
/* @source ../pachislot/tpl/main.js */;

define("../pachislot/tpl/main", [], function(){

    return {"template":"\n<div class=\"view main-view\" style=\"width:{%= width * (col + emptyCol*2) %}px;\">\n    <div class=\"roller\">\n\n        {% for (var i = 0; i < emptyCol; i++) { %}\n        <ul class=\"empty-slot\" style=\"width:{%= width - 10 %}px;\"></ul>\n        {% } %}\n\n        <ul class=\"slot\" style=\"width:{%= width - 10 %}px;\">\n        {% data.forEach(function(item, i){ %}\n\n            {% if (i % num === 0) { %}\n\n                {% if (i !== 0) { %}\n                </ul><ul class=\"slot\" style=\"width:{%= width - 10 %}px;\">\n                {% } %}\n\n                {% var last = data[i + num - 1]; if (!last) { last = data[data.length - 1]; } %}\n                <li><a href=\"#{%= last[0] %}\" style=\"height:{%= height %}px;\">\n                    <strong>{%= last[2] %}</strong>\n                    <img src=\"{%= dataPicUrl %}{%= last[1] %}\">\n                </a></li>\n\n            {% } %}\n\n            <li><a href=\"#{%= item[0] %}\" style=\"height:{%= height %}px;\">\n                <strong>{%= item[2] %}</strong>\n                <img src=\"{%= dataPicUrl %}{%= item[1] %}\">\n            </a></li>\n\n        {% }); %}\n        </ul>\n\n        {% for (var i = 0; i < emptyCol; i++) { %}\n        <ul class=\"empty-slot\" style=\"width:{%= width - 10 %}px;\"></ul>\n        {% } %}\n\n    </div>\n</div>\n"}; 

});
/* @source ../pachislot/tpl/led.js */;

define("../pachislot/tpl/led", [], function(){

    return {"template":"\n<div class=\"{%= side %}\">\n    {% for (var i = 0; i < num; i++) { %}\n    <div class=\"led\"></div>\n    {% } %}\n</div>\n"}; 

});
/* @source mo/template/string.js */;

/**
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/template/string", [], function(require, exports){

    exports.format = function(tpl, op){
        return tpl.replace(/\{\{(\w+)\}\}/g, function(e1,e2){
            return op[e2] != null ? op[e2] : "";
        });
    };

    exports.escapeHTML = function(str){
        str = str || '';
        var xmlchar = {
            //"&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
            "{": "&#123;",
            "}": "&#125;",
            "@": "&#64;"
        };
        return str.replace(/[<>'"\{\}@]/g, function($1){
            return xmlchar[$1];
        });
    };

    exports.substr = function(str, limit, cb){
        if(!str || typeof str !== "string")
            return '';
        var sub = str.substr(0, limit).replace(/([^\x00-\xff])/g, '$1 ').substr(0, limit).replace(/([^\x00-\xff])\s/g, '$1');
        return cb ? cb.call(sub, sub) : (str.length > sub.length ? sub + '...' : sub);
    };

    exports.strsize = function(str){
        return str.replace(/([^\x00-\xff]|[A-Z])/g, '$1 ').length;
    };

});


/* @source mo/lang/es5.js */;

/**
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/lang/es5", [], function(){

    var host = this,
        Array = host.Array,
        String = host.String,
        Object = host.Object,
        Function = host.Function,
        window = host.window,
        _toString = Object.prototype.toString,
        _aproto = Array.prototype;

    if (!_aproto.filter) {
        _aproto.filter = function(fn, sc){
            var r = [];
            for (var i = 0, l = this.length; i < l; i++){
                if (i in this && fn.call(sc, this[i], i, this)) {
                    r.push(this[i]);
                }
            }
            return r;
        };
    }
        
    if (!_aproto.forEach) {
        _aproto.forEach = function(fn, sc){
            for(var i = 0, l = this.length; i < l; i++){
                if (i in this)
                    fn.call(sc, this[i], i, this);
            }
        };
    }

    if (!_aproto.map) {
        _aproto.map = function(fn, sc){
            for (var i = 0, copy = [], l = this.length; i < l; i++) {
                if (i in this) {
                    copy[i] = fn.call(sc, this[i], i, this);
                }
            }
            return copy;
        };
    }

    if (!_aproto.reduce) {
        _aproto.reduce = function(fn, sc){
            for (var i = 1, prev = this[0], l = this.length; i < l; i++) {
                if (i in this) {
                    prev = fn.call(sc, prev, this[i], i, this);
                }
            }
            return prev;
        };
    }

    if (!_aproto.some) {
        _aproto.some = function(fn, sc){
            for (var i = 0, l = this.length; i < l; i++){
                if (i in this && fn.call(sc, this[i], i, this)) {
                    return true;
                }
            }
            return false;
        };
    }

    if (!_aproto.every) {
        _aproto.every = function(fn, sc){
            for (var i = 0, l = this.length; i < l; i++){
                if (i in this && !fn.call(sc, this[i], i, this)) {
                    return false;
                }
            }
            return true;
        };
    }

    if (!_aproto.indexOf) {
        _aproto.indexOf = function(elt, from){
            var l = this.length;
            from = parseInt(from, 10) || 0;
            if (from < 0)
                from += l;
            for (; from < l; from++) {
                if (from in this && this[from] === elt)
                    return from;
            }
            return -1;
        };
    }

    if (!_aproto.lastIndexOf) {
        _aproto.lastIndexOf = function(elt, from){
            var l = this.length;
            from = parseInt(from, 10) || l - 1;
            if (from < 0)
                from += l;
            for (; from > -1; from--) {
                if (from in this && this[from] === elt)
                    return from;
            }
            return -1;
        };
    }

    if (!Array.isArray) {
        Array.isArray = function(obj) {
            return _toString.call(obj) === "[object Array]";
        };
    }

    var rnotwhite = /\S/,
        trimLeft = /^\s+/,
        trimRight = /\s+$/;
    if (rnotwhite.test( "\xA0")) {
        trimLeft = /^[\s\xA0]+/;
        trimRight = /[\s\xA0]+$/;
    }
    if (!String.prototype.trim) {
        String.prototype.trim = function(text) {
            return text == null ?  "" : text.toString().replace(trimLeft, "").replace(trimRight, "");
        };
    }

    if (!Object.keys) {
        Object.keys = function(obj) {
            var keys = [];
            for (var prop in obj) {
                if ( obj.hasOwnProperty(prop) ) {
                    keys.push(prop);
                }
            }
            return keys;
        };
    }

    if (!Object.create) {
        Object.create = function(obj) {
            function NewObj(){}
            NewObj.prototype = obj;
            return new NewObj();
        };
    }

    if (!Object.getPrototypeOf) {
        Object.getPrototypeOf = function (obj) {
            return obj.__proto__ || obj.constructor.prototype;
        };
    }
    

    if (!Function.prototype.bind) {
        Function.prototype.bind = function (oThis) {
            var aArgs = _aproto.slice.call(arguments, 1), 
                fToBind = this, 
                fBound = function () {
                    return fToBind.apply(this instanceof fBound ? this : oThis || window, 
                        aArgs.concat(_aproto.slice.call(arguments)));    
                };
            fBound.prototype = Object.create(this.prototype);
            return fBound;
        };
    }

});

/* @source mo/lang/type.js */;

/**
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/lang/type", [
  "mo/lang/es5"
], function(_0, require, exports){

    var _toString = Object.prototype.toString,
        _aproto = Array.prototype,
        _typeMap = {};

    _aproto.forEach.call("Boolean Number String Function Array Date RegExp Object".split(" "), function(name , i){
        this[ "[object " + name + "]" ] = name.toLowerCase();
    }, _typeMap);

    function type(obj) {
        return obj == null ?
            String(obj) :
            _typeMap[ _toString.call(obj) ] || "object";
    }

    exports.type = type;

    exports.isFunction = function(obj) {
        return _toString.call(obj) === "[object Function]";
    };

    exports.isWindow = function(obj) {
        return "setInterval" in obj;
    };

	exports.isEmptyObject = function(obj) {
        for (var name in obj) {
            return false;
        }
        return true;
	};

});

/* @source mo/lang/mix.js */;

/**
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/lang/mix", [
  "mo/lang/es5",
  "mo/lang/type"
], function(_0, _, require, exports){

    var type = _.type;

    function mix(origin) {
        var objs = arguments, ol = objs.length, 
            VALTYPE = { 'number': 1, 'boolean': 2, 'string': 3 },
            obj, lvl, i, l;
        if (typeof objs[ol - 1] !== 'object') {
            lvl = objs[ol - 1] || 0;
            ol--;
        } else {
            lvl = 0;
        }
        for (var n = 1; n < ol; n++) {
            obj = objs[n];
            if (Array.isArray(obj)) {
                origin = !VALTYPE[typeof origin] && origin || [];
                l = obj.length;
                for (i = 0; i < l; i++) {
                    if (lvl >= 1 && obj[i] && typeof obj[i] === 'object') {
                        origin[i] = mix(origin[i], obj[i], lvl - 1);
                    } else {
                        origin[i] = obj[i];
                    }
                }
            } else {
                origin = !VALTYPE[typeof origin] && origin || {};
                for (i in obj) {
                    if (lvl >= 1 && obj[i] && typeof obj[i] === 'object') {
                        origin[i] = mix(origin[i], obj[i], lvl - 1);
                    } else {
                        origin[i] = obj[i];
                    }
                }
            }
        }
        return origin;
    }

    function merge(origin) {
        var objs = arguments, ol = objs.length, 
            ITERTYPE = { 'object': 1, 'array': 2 },
            obj, lvl, i, k, lib, marked, mark;
        if (typeof objs[ol - 1] !== 'object') {
            lvl = objs[ol - 1] || 0;
            ol--;
        } else {
            lvl = 0;
        }
        for (var n = 1; n < ol; n++) {
            obj = objs[n];
            if (Array.isArray(origin)) {
                origin = origin || [];
                lib = {};
                marked = [];
                mark = '__oz_uniqmark_' + (+new Date() + Math.random());
                obj = obj.concat(origin);
                origin.length = 0;
                obj.forEach(function(i){
                    if (i && typeof i === 'object') {
                        if (!i[mark]) {
                            if (lvl >= 1 && Array.isArray(i)) {
                                origin.push(merge(i, [], lvl - 1));
                            } else {
                                origin.push(i);
                            }
                            i[mark] = 1;
                            marked.push(i);
                        }
                    } else {
                        k = (typeof i) + '_' + i;
                        if (!this[k]) {
                            origin.push(i);
                            this[k] = 1;
                        }
                    }
                }, lib);
                marked.forEach(function(i){
                    delete i[mark];
                });
            } else {
                origin = origin || {};
                for (i in obj) {
                    if (!origin.hasOwnProperty(i)) {
                        origin[i] = obj[i];
                    } else if (lvl >= 1 && i 
                            // avoid undefined === undefined
                            && ITERTYPE[type(origin[i])] + 0 === ITERTYPE[type(obj[i])] + 0) {
                        origin[i] = merge(origin[i], obj[i], lvl - 1);
                    }
                }
            }
        }
        return origin;
    }

    function interset(origin) {
        var objs = arguments, ol = objs.length, 
            ITERTYPE = { 'object': 1, 'array': 2 },
            obj, lvl, i, k, lib, marked, mark;
        if (typeof objs[ol - 1] !== 'object') {
            lvl = objs[ol - 1] || 0;
            ol--;
        } else {
            lvl = 0;
        }
        for (var n = 1; n < ol; n++) {
            obj = objs[n];
            if (Array.isArray(origin)) {
                origin = origin || [];
                lib = {};
                marked = [];
                mark = '__oz_uniqmark_' + (+new Date() + Math.random());
                origin.forEach(function(i){
                    if (i && typeof i === 'object' && !i[mark]) {
                        i[mark] = 1;
                        marked.push(i);
                    } else {
                        k = (typeof i) + '_' + i;
                        this[k] = 1;
                    }
                }, lib);
                origin.length = 0;
                obj.forEach(function(i){
                    if (i && typeof i === 'object') {
                        if (i[mark] === 1) {
                            origin.push(i);
                            i[mark] = 2;
                        }
                    } else {
                        k = (typeof i) + '_' + i;
                        if (this[k] === 1) {
                            origin.push(i);
                            this[k] = 2;
                        }
                    }
                }, lib);
                marked.forEach(function(i){
                    delete i[mark];
                });
            } else {
                origin = origin || {};
                for (i in origin) {
                    if (!obj.hasOwnProperty(i)) {
                        delete origin[i];
                    } else if (lvl >= 1 && i 
                            && ITERTYPE[type(origin[i])] + 0 === ITERTYPE[type(obj[i])] + 0) {
                        origin[i] = interset(origin[i], obj[i], lvl - 1);
                    }
                }
            }
        }
        return origin;
    }

    exports.mix = mix;
    exports.merge = merge;
    exports.interset = interset;

    exports.copy = function(obj, lvl) {
        return mix(null, obj, lvl);
    };

    exports.occupy = function(origin, obj, lvl) {
        return mix(interset(origin, obj, lvl), obj, lvl);
    };

    exports.defaults = merge;

    exports.config = function(cfg, opt, default_cfg, lvl){
        return mix(merge(cfg, default_cfg, lvl), interset(mix(null, opt, lvl), default_cfg, lvl), lvl);
    };

    exports.unique = function(origin, lvl) {
        return merge(origin, [], lvl);
    };

});


/* @source mo/lang/oop.js */;

/**
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/lang/oop", [
  "mo/lang/es5",
  "mo/lang/mix"
], function(es5, _, require, exports){

    var mix = _.mix;

    function _apply(base, self, args){
        return base.apply(self, args);
    }

    exports.construct = function(base, mixes, factory){
        if (mixes && !Array.isArray(mixes)) {
            factory = mixes;
        }
        if (!factory) {
            factory = function(){
                this.superConstructor.apply(this, arguments);
            };
        }
        var proto = Object.create(base.prototype),
            supr = Object.create(base.prototype),
            constructor = function(){
                var self = this;
                this.constructor = constructor;
                this.superConstructor = function(){
                    _apply.prototype = base.prototype;
                    var su = new _apply(base, self, arguments);
                    for (var i in su) {
                        if (!self[i]) {
                            self[i] = supr[i] = su[i];
                        }
                    }
                };
                this.superClass = supr;
                return factory.apply(this, arguments);
            };
        constructor.prototype = proto;
        if (mixes) {
            mixes = mix.apply(this, mixes);
            mix(proto, mixes);
            mix(supr, mixes);
        }
        return constructor;
    };

});

/* @source mo/lang/struct.js */;

/**
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/lang/struct", [
  "mo/lang/es5",
  "mo/lang/mix"
], function(_0, _, require, exports){

    var mix = _.mix;

    exports.index = function(list, key) {
        var obj = {}, item;
        for (var i = 0, l = list.length; i < l; i++) {
            item = list[i];
            if (key && typeof item === 'object') {
                obj[item[key]] = item;
            } else {
                obj[item] = true;
            }
        }
        return obj;
    };

    exports.fnQueue = function(){
        var queue = [], dup = false;
        function getCallMethod(type){
            return function(){
                var re, fn;
                dup = this.slice().reverse();
                while (fn = dup.pop()) {
                    re = fn[type].apply(fn, arguments);
                }
                dup = false;
                return re;
            };
        }
        mix(queue, {
            call: getCallMethod('call'),
            apply: getCallMethod('apply'),
            clear: function(func){
                if (!func) {
                    this.length = 0;
                } else {
                    var size = this.length,
                        popsize = size - dup.length;
                    for (var i = this.length - 1; i >= 0; i--) {
                        if (this[i] === func) {
                            this.splice(i, 1);
                            if (dup && i >= popsize)
                                dup.splice(size - i - 1, 1);
                        }
                    }
                    if (i < 0)
                        return false;
                }
                return true;
            }
        });
        return queue;
    };

});


/* @source mo/lang.js */;

/**
 * ES5/6 shim and minimum utilities for language enhancement
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/lang", [
  "mo/lang/es5",
  "mo/lang/type",
  "mo/lang/mix",
  "mo/lang/struct",
  "mo/lang/oop"
], function(es5, detect, _, struct, oo, require, exports){

    var host = this,
        window = host.window;

    _.mix(exports, detect, _, struct, oo);

    exports.ns = function(namespace, v, parent){
        var i, p = parent || window, n = namespace.split(".").reverse();
        while ((i = n.pop()) && n.length > 0) {
            if (typeof p[i] === 'undefined') {
                p[i] = {};
            } else if (typeof p[i] !== "object") {
                return false;
            }
            p = p[i];
        }
        if (typeof v !== 'undefined')
            p[i] = v;
        return p[i];
    };

});

/* @source mo/template/micro.js */;

/**
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/template/micro", [
  "mo/lang",
  "mo/template/string"
], function(_, stpl, require, exports){

    var document = this.document;

    exports.tplSettings = {
        _cache: {},
        evaluate: /\{%([\s\S]+?)%\}/g,
        interpolate: /\{%=([\s\S]+?)%\}/g
    };
    exports.tplHelpers = {
        mix: _.mix,
        escapeHTML: stpl.escapeHTML,
        substr: stpl.substr,
        include: convertTpl,
        _has: function(obj){
            return function(name){
                return _.ns(name, undefined, obj);
            };
        }
    };

    function convertTpl(str, data, namespace){
        var func, c  = exports.tplSettings, suffix = namespace ? '#' + namespace : '';
        if (!/[\t\r\n% ]/.test(str)) {
            func = c._cache[str + suffix];
            if (!func) {
                var tplbox = document.getElementById(str);
                if (tplbox) {
                    func = c._cache[str + suffix] = convertTpl(tplbox.innerHTML, false, namespace);
                }
            }
        } else {
            func = new Function(namespace || 'obj', 'api', 'var __p=[];' 
                + (namespace ? '' : 'with(obj){')
                    + 'var mix=api.mix,escapeHTML=api.escapeHTML,substr=api.substr,include=api.include,has=api._has(' + (namespace || 'obj') + ');'
                    + '__p.push(\'' +
                    str.replace(/\\/g, '\\\\')
                        .replace(/'/g, "\\'")
                        .replace(c.interpolate, function(match, code) {
                            return "'," + code.replace(/\\'/g, "'") + ",'";
                        })
                        .replace(c.evaluate || null, function(match, code) {
                            return "');" + code.replace(/\\'/g, "'")
                                                .replace(/[\r\n\t]/g, ' ') + "__p.push('";
                        })
                        .replace(/\r/g, '\\r')
                        .replace(/\n/g, '\\n')
                        .replace(/\t/g, '\\t')
                    + "');" 
                + (namespace ? "" : "}")
                + "return __p.join('');");
        }
        return !func ? '' : (data ? func(data, exports.tplHelpers) : func);
    }

    exports.convertTpl = convertTpl;
    exports.reloadTpl = function(str){
        delete exports.tplSettings._cache[str];
    };

});


/* @source mo/template.js */;

/**
 * A lightweight and enhanced micro-template implementation, and minimum utilities
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/template", [
  "mo/lang",
  "mo/template/string",
  "mo/template/micro"
], function(_, stpl, microtpl, require, exports){

    _.mix(exports, stpl, microtpl);

    exports.str2html = function(str){ // @TODO 
        var temp = document.createElement("div");
        temp.innerHTML = str;
        var child = temp.firstChild;
        if (temp.childNodes.length == 1) {
            return child;
        }
        var fragment = document.createDocumentFragment();
        do {
            fragment.appendChild(child);
        } while (child = temp.firstChild);
        return fragment;
    };

});

/* @source dollar.js */;

/**
 * DollarJS
 * A jQuery-compatible and non-All-in-One library which is more "Zepto" than Zepto.js
 * Focus on DOM operations and mobile platform, wrap native API wherever possible.
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("dollar", [
  "mo/lang/es5",
  "mo/lang/mix",
  "mo/lang/type"
], function(es5, _, detect){

    var window = this,
        doc = window.document,
        NEXT_SIB = 'nextElementSibling',
        PREV_SIB = 'prevElementSibling',
        FIRST_CHILD = 'firstElementChild',
        MATCHES_SELECTOR = ['webkitMatchesSelector', 'mozMatchesSelector', 'matchesSelector']
            .map(function(name){
                return this[name] && name;
            }, doc.body).filter(pick)[0],
        _MOE = 'MouseEvents',
        SPECIAL_EVENTS = { click: _MOE, mousedown: _MOE, mouseup: _MOE, mousemove: _MOE },
        CSS_NUMBER = { 
            'column-count': 1, 'columns': 1, 'font-weight': 1, 
            'line-height': 1, 'opacity': 1, 'z-index': 1, 'zoom': 1 
        },
        RE_HTMLTAG = /^\s*<(\w+|!)[^>]*>/,
        isFunction = detect.isFunction,
        _array_each = Array.prototype.forEach,
        _array_map = Array.prototype.map,
        _array_push = Array.prototype.push,
        _getComputedStyle = document.defaultView.getComputedStyle,
        _next_pointer,
        _elm_display = {},
        _html_containers = {};


    function $(selector, context){
        if (selector) {
            if (selector.constructor === $) {
                return selector;
            } else if (typeof selector !== 'string') {
                var nodes = new $();
                _array_push[selector.push === _array_push 
                    ? 'apply' : 'call'](nodes, selector);
                return nodes;
            } else {
                selector = selector.trim();
                if (RE_HTMLTAG.test(selector)) {
                    return create_nodes(selector);
                } else if (context) {
                    return $(context).find(selector);
                } else {
                    return ext.find(selector);
                }
            }
        } else if (this === window) {
            return new $();
        }
    }

    var ext = $.fn = $.prototype = [];

    ['map', 'filter', 'slice', 'reverse', 'sort'].forEach(function(method){
        var origin = this['_' + method] = this[method];
        this[method] = function(){
            return $(origin.apply(this, arguments));
        };
    }, ext);

    ['splice', 'concat'].forEach(function(method){
        var origin = this['_' + method] = this[method];
        this[method] = function(){
            return $(origin.apply(this._slice(), _array_map.call(
                arguments, function(i){
                    return i._slice();
                })
            ));
        };
    }, ext);

    _.mix(ext, {

        constructor: $,

        // Traversing

        find: function(selector){
            var nodes = new $(), contexts;
            if (this === ext) {
                contexts = [doc];
            } else {
                nodes.prevObject = contexts = this;
            }
            if (/^#[\w_]+$/.test(selector)) {
                var elm = (contexts[0] || doc).getElementById(selector.substr(1));
                if (elm) {
                    nodes.push(elm);
                }
            } else {
                var query = /\W/.test(selector) ? 'querySelectorAll' 
                                                : 'getElementsByTagName';
                if (contexts[1]) {
                    contexts.forEach(function(context){
                        this.push.apply(this, context[query](selector));
                    }, nodes);
                } else if (contexts[0]) {
                    nodes.push.apply(nodes, contexts[0][query](selector));
                }
            }
            return nodes;
        },

        eq: function(i){
            return i === -1 ? this.slice(-1) : this.slice(i, i + 1);
        },

        not: function(selector){
            return this.filter(function(node){
                return node && !this(node, selector);
            }, matches_selector);
        },

        has: function(selector){
            return this.filter(function(node){
                return this(node, selector);
            }, matches_selector);
        },

        parent: find_near('parentNode'),

        parents: function(selector){
            var ancestors = new $(), p = this,
                finding = selector ? find_selector(selector, 'parentNode') : function(node){
                    return this[this.push(node.parentNode) - 1];
                };
            while (p.length) {
                p = p.map(finding, ancestors);
            }
            return ancestors;
        },

        closest: function(selector){
            var ancestors = new $(), p = this, 
                finding = find_selector(selector, 'parentNode');
            while (p.length && !ancestors.length) {
                p = p.map(finding, ancestors);
            }
            return ancestors.length && ancestors || this;
        },

        siblings: find_sibs(NEXT_SIB, FIRST_CHILD),

        next: find_near(NEXT_SIB),

        nextAll: find_sibs(NEXT_SIB),

        nextUntil: find_sibs(NEXT_SIB, false, true),

        prev: find_near(PREV_SIB),

        prevAll: find_sibs(PREV_SIB),

        prevUntil: find_sibs(PREV_SIB, false, true),

        children: function(){
            return _.merge.apply(_, this.map(function(node){
                return this(node.children);
            }, $));
        },

        contents: function(){
            return _.merge.apply(_, this.map(function(node){
                return this(node.childNodes);
            }, $));
        },

        // Detection

        is: function(selector){
            return this.some(function(node){
                return matches_selector(node, selector);
            });
        },

        hasClass: function(cname){
            for (var i = 0, l = this.length; i < l; i++) {
                if (this[i].classList.contains(cname)) {
                    return true;
                }
            }
            return false;
        },

        // Properties

        addClass: function(cname){
            return foreach_farg(this, cname, 'className', function(node, cname){
                node.classList.add(cname);
            });
        },

        removeClass: function(cname){
            return foreach_farg(this, cname, 'className', function(node, cname){
                node.classList.remove(cname);
            });
        },

        toggleClass: function(cname, force){
            return foreach_farg(this, cname, 'className', function(node, cname){
                node.classList[typeof this === 'undefined' && 'toggle'
                                    || this && 'add' || 'remove'](cname);
            }, force);
        },

        attr: kv_access(function(node, name, value){
            node.setAttribute(name, value);
        }, function(node, name){
            return node && node.getAttribute(name);
        }),

        removeAttr: function(name){
            this.forEach(function(node){
                node.removeAttribute(this);
            }, name);
            return this;
        },

        prop: kv_access(function(node, name, value){
            node[name] = value;
        }, function(node, name){
            return (node || {})[name];
        }),

        removeProp: function(name){
            this.forEach(function(node){
                delete node[this];
            }, name);
            return this;
        },

        data: kv_access(function(node, name, value){
            node.dataset[css_method(name)] = value;
        }, function(node, name){
            return (node || {}).dataset[css_method(name)];
        }),

        removeData: function(name){
            this.forEach(function(node){
                delete node.dataset[this];
            }, name);
            return this;
        },

        val: function(value){
            var node = this[0];
            if (value === undefined) {
                if (node) {
                    if (node.multiple) {
                        return $('option', this).filter(function(item){
                            return item.selected;
                        }).map(function(item){
                            return item.value;
                        });
                    }
                    return node.value;
                }
            } else {
                return foreach_farg(this, value, 'value', function(node, value){
                    node.value = value;
                });
            }
        },

        empty: function(){
            this.forEach(function(node){
                node.innerHTML = '';
            });
            return this;
        },

        html: function(str){
            return str === undefined ? (this[0] || {}).innerHTML
                : foreach_farg(this, str, 'innerHTML', function(node, str){
                    if (RE_HTMLTAG.test(str)) {
                        this(node).empty().append(str);
                    } else {
                        node.innerHTML = str;
                    }
                }, $);
        },

        text: function(str){
            return str === undefined ? (this[0] || {}).textContent
                : foreach_farg(this, str, 'textContent', function(node, str){
                    node.textContent = str;
                });
        },

        clone: function(){
            return this.map(function(node){
                return node.cloneNode(true);
            });
        },

        css: kv_access(function(node, name, value){
            var prop = css_prop(name);
            if (!value && value !== 0) {
                node.style.removeProperty(prop);
            } else {
                node.style.cssText += ';' + prop + ":" + css_unit(prop, value);
            }
        }, function(node, name){
            return node && (node.style[css_method(name)] 
                || _getComputedStyle(node, '').getPropertyValue(name));
        }, function(self, dict){
            var prop, value, css = '';
            for (var name in dict) {
                value = dict[name];
                prop = css_prop(name);
                if (!value && value !== 0) {
                    self.forEach(function(node){
                        node.style.removeProperty(this);
                    }, prop);
                } else {
                    css += prop + ":" + css_unit(prop, value) + ';';
                }
            }
            self.forEach(function(node){
                node.style.cssText += ';' + this;
            }, css);
        }),

        hide: function(){
            return this.css("display", "none");
        },

        show: function(){
            this.forEach(function(node){
                if (node.style.display === "none") {
                    node.style.display = null;
                }
                if (this(node, '').getPropertyValue("display") === "none") {
                    node.style.display = default_display(node.nodeName);
                }
            }, _getComputedStyle);
            return this;
        },

        // Dimensions

        offset: function(){
            var set = this[0].getBoundingClientRect();
            return {
                left: set.left + window.pageXOffset,
                top: set.top + window.pageYOffset,
                width: set.width,
                height: set.height
            };
        },

        width: dimension('Width'),

        height: dimension('Height'),

        // Manipulation

        appendTo: operator_insert_to(1),

        append: operator_insert(1),

        prependTo: operator_insert_to(3),

        prepend: operator_insert(3),

        insertBefore: operator_insert_to(2),

        before: operator_insert(2),

        insertAfter: operator_insert_to(4),

        after: operator_insert(4),

        replaceAll: function(targets){
            var t = $(targets);
            this.insertBefore(t);
            t.remove();
            return this;
        },

        replaceWith: function(contents){
            return $(contents).replaceAll(this);
        },

        wrap: function(boxes){
            return foreach_farg(this, boxes, false, function(node, boxes){
                this(boxes).insertBefore(node).append(node);
            }, $);
        },

        wrapAll: function(boxes){
            $(boxes).insertBefore(this.eq(0)).append(this);
            return this;
        },

        wrapInner: function(boxes){
            return foreach_farg(this, boxes, false, function(node, boxes){
                this(node).contents().wrapAll(boxes);
            }, $);
        },

        unwrap: function(){
            this.parent().forEach(function(node){
                this(node).children().replaceAll(node);
            }, $);
            return this;
        },

        remove: function(){
            this.forEach(function(node){
                var parent = node.parentNode;
                if (parent) {
                    parent.removeChild(node);
                }
            });
            return this;
        },

        // Event

        bind: event_access('add'),

        unbind: event_access('remove'),

        trigger: function(event, argv){
            if (typeof event === 'string') {
                event = Event(event);
            }
            _.mix(event, argv);
            this.forEach(event.type == 'submit' 
                && !event.defaultPrevented ? function(node){
                node.submit();
            } : function(node){
                if ('dispatchEvent' in node) {
                    node.dispatchEvent(this);
                }
            }, event);
            return this;
        },

        // Miscellaneous

        end: function(){
            return this.prevObject || new $();
        },

        each: function(fn){
            for (var i = 0, l = this.length; i < l; i++){
                var re = fn.call(this[i], i);
                if (re === false) {
                    break;      
                }
            }
            return this;
        }

    });

    // private

    function pick(v){ 
        return v; 
    }

    function matches_selector(elm, selector){
        return elm && elm[MATCHES_SELECTOR](selector);
    }

    function find_selector(selector, attr){
        return function(node){
            if (attr) {
                node = node[attr];
            }
            if (matches_selector(node, selector)) {
                this.push(node);
            }
            return node;
        };
    }

    function find_near(prop){
        return function(selector){
            return $(_.unique([undefined, doc, null].concat(
                this._map(selector ? function(node){
                    var n = node[prop];
                    if (n && matches_selector(n, selector)) {
                        return n;
                    }
                } : function(node){
                    return node[prop];
                })
            )).slice(3));
        };
    }

    function find_sibs(prop, start, has_until){
        return function(target, selector){
            if (!has_until) {
                selector = target;
            }
            var sibs = new $();
            this.forEach(function(node){
                var until,
                    n = start ? node.parentNode[start] : node;
                if (has_until) {
                    until = $(target, node.parentNode);
                }
                do {
                    if (until && until.indexOf(n) > -1) {
                        break;
                    }
                    if (node !== n && (!selector 
                        || matches_selector(n, selector))) {
                        this.push(n);
                    }
                } while (n = n[prop]);
            }, sibs);
            return _.unique(sibs);
        };
    }

    function foreach_farg(nodes, arg, prop, cb, context){
        var is_fn_arg = isFunction(arg);
        nodes.forEach(function(node, i){
            cb.call(context, node, !is_fn_arg ? arg
                : arg.call(this, i, prop && node[prop]));
        }, nodes);
        return nodes;
    }

    function kv_access(setter, getter, map){
        return function(name, value){
            if (typeof name === 'object') {
                if (map) {
                    map(this, name);
                } else {
                    for (var k in name) {
                        this.forEach(function(node){
                            setter(node, this, name[this]);
                        }, k);
                    }
                }
            } else {
                if (value !== undefined) {
                    var is_fn_arg = isFunction(value);
                    this.forEach(function(node, i){
                        setter(node, name, !is_fn_arg ? value 
                            : value.call(this, i, getter(node, name)));
                    }, this);
                } else {
                    return getter(this[0], name);
                }
            }
            return this;
        };
    }

    function event_access(action){
        function access(subject, cb){
            if (typeof subject === 'object') {
                for (var i in subject) {
                    access.call(this, [i, subject[i]]);
                }
            } else if (cb) {
                this.forEach(function(node){
                    node[action + 'EventListener'](subject, this, false);
                }, cb);
            }  // not support 'removeAllEventListener'
            return this;
        }
        return access;
    }

    function Event(type, props) {
        var bubbles = true,
            event = document.createEvent(SPECIAL_EVENTS[type] || 'Events');
        if (props) {
            if ('bubbles' in props) {
                bubbles = !!props.bubbles;
                delete props.bubbles;
            }
            _.mix(event, props);
        }
        event.initEvent(type, bubbles, true);
        return event;
    }

    function css_method(name){
        return name.replace(/-+(.)?/g, function($0, $1){
            return $1 ? $1.toUpperCase() : '';
        }); 
    }

    function css_prop(name) {
        return name.replace(/::/g, '/')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
            .replace(/([a-z\d])([A-Z])/g, '$1_$2')
            .replace(/_/g, '-')
            .toLowerCase();
    }

    function css_unit(name, value) {
        return typeof value == "number" && !CSS_NUMBER[name] 
            && value + "px" || value;
    }

    function default_display(tag) {
        var display = _elm_display[tag];
        if (!display) {
            var tmp = document.createElement(tag);
            doc.body.appendChild(tmp);
            display = _getComputedStyle(tmp, '').getPropertyValue("display");
            tmp.parentNode.removeChild(tmp);
            if (display === "none") {
                display = "block";
            }
            _elm_display[tag] = display;
        }
        return display;
    }

    function dimension(method){
        return function(){
            var offset;
            return this[0] === window 
                ? window['inner' + method] 
                : this[0] === doc 
                    ? doc.documentElement['offset' + method] 
                    : (this.offset() || {})[method.toLowerCase()];
        };
    }

    function create_nodes(str, attrs){
        var tag = (RE_HTMLTAG.exec(str) || [])[0] || str;
        var temp = _html_containers[tag];
        if (!temp) {
            temp = _html_containers[tag] = tag === 'tr' && document.createElement('tbody')
                || (tag === 'tbody' || tag === 'thead' || tag === 'tfoot') 
                    && document.createElement('table')
                || (tag === 'td' || tag === 'th') && document.createElement('tr')
                || document.createElement('div');
        }
        temp.innerHTML = str;
        var nodes = new $();
        _array_push.apply(nodes, temp.childNodes);
        nodes.forEach(function(node){
            this.removeChild(node);
        }, temp);
        if (attrs) {
            for (var k in attrs) {
                nodes.attr(k, attrs[k]);
            }
        }
        return nodes;
    }

    function insert_node(target, node, action){
        if (node.nodeName.toUpperCase() === 'SCRIPT' 
                && (!node.type || node.type === 'text/javascript')) {
            window['eval'].call(window, node.innerHTML);
        }
        switch(action) {
            case 1: target.appendChild(node); break;
            case 2: target.parentNode.insertBefore(node, target); break;
            case 3: target.insertBefore(node, target.firstChild); break;
            case 4: target.parentNode.insertBefore(node, target.nextSibling); break;
            default: break;
        }
    }

    function insert_nodes(action, is_reverse){
        var fn = is_reverse ? function(target){
            insert_node(target, this, action);
        } : function(content){
            insert_node(this, content, action);
        };
        return function(elms){
            this.forEach(function(node){
                this.forEach(fn, node);
            }, $(elms));
            return this;
        };
    }

    function operator_insert_to(action){
        return insert_nodes(action, true);
    }

    function operator_insert(action){
        return insert_nodes(action);
    }

    // public static API

    $.find = $;
    $.matchesSelector = matches_selector;
    $.createNodes = create_nodes;
    $.camelize = css_method;
    $.dasherize = css_prop;
    $.Event = Event;

    $.VERSION = '1.1.1';

    return $;

});

/* @source ../pachislot/horserace.js */;


define("../pachislot/horserace", [
  "mo/lang",
  "dollar",
  "mo/template",
  "../pachislot/tpl/led"
], function(_, $, tpl, tpl_led){

    var TPL_LED = tpl_led.template,
        DEFAULTS = {
            frame: null,
            inner: null,
            group: 5
        };

    function Horserace(opt){
        this._config = _.config({}, opt, DEFAULTS);
        this.reset();
    }

    Horserace.prototype = {

        reset: function(){
            this._led_pointer = 0;
            clearTimeout(this._lampTimer);
            var inner = $(this._config.inner),
                w = inner.width(),
                h = inner.height(),
                size = 35;
            var html = tpl.convertTpl(TPL_LED, {
                num: Math.floor(w / size) + 1,
                side: 'top'
            }) + tpl.convertTpl(TPL_LED, {
                num: Math.floor(w / size) + 1,
                side: 'bottom'
            }) + tpl.convertTpl(TPL_LED, {
                num: Math.floor(h / size) + 1,
                side: 'left'
            }) + tpl.convertTpl(TPL_LED, {
                num: Math.floor(h / size) + 1,
                side: 'right'
            });
            $(this._config.frame).html(html);
        },

        stop: function(){
            var leds = $('.led', this._config.frame);
            clearTimeout(this._lampTimer);
            leds.forEach(function(led){
                led.className = 'led';
            });
        },

        welcome: function(){
            this.whirling('blue', 2600, 600);
        },

        waiting: function(){
            this.whirling('yellow', 400, 200);
        },

        greeting: function(){
            this.twinkle('yellow', 200, 200); 
        },

        twinkle: function(style, on, off){
            var self = this,
                leds = $('.led', this._config.frame);
            clearTimeout(this._lampTimer);
            leds.forEach(function(led){
                led.className = 'led';
            });
            (function(){
                var fn = arguments.callee;
                leds.forEach(function(led){
                    $(led).addClass(style);
                });
                self._lampTimer = setTimeout(function(){
                    leds.forEach(function(led){
                        $(led).removeClass(style);
                    });
                    self._lampTimer = setTimeout(fn, off);
                }, on);
            })();
        },

        whirling: function(style, duration, expire){
            var self = this,
                lamp = this._config.frame,
                leds = $('.top .led', lamp).concat(
                    $('.right .led', lamp)
                ).concat(
                    $('.bottom .led', lamp).reverse()
                ).concat(
                    $('.left .led', lamp).reverse()
                ),
                total = leds.length;
            clearTimeout(this._lampTimer);
            leds.forEach(function(led){
                led.className = 'led';
            });
            (function(){
                if (self._led_pointer > total) {
                    self._led_pointer = 0;
                }
                var current = self._led_pointer,
                    l = current + self._config.group;
                for (; self._led_pointer < l; self._led_pointer++) {
                    leds.eq(self._led_pointer).addClass(style);
                }
                setTimeout(function(){
                    for (; current < l; current++) {
                        leds.eq(current).removeClass(style);
                    }
                }, expire);
                self._lampTimer = setTimeout(arguments.callee,
                    Math.round(duration / (total / self._config.group)));
            })();
        }
    
    };

    function exports(opt) {
        return new exports.Horserace(opt);
    }

    exports.Horserace = Horserace;

    return exports;

});

/* @source eventmaster.js */;

/**
 * EventMaster
 * A simple, compact and consistent implementation of a variant of CommonJS's Promises and Events
 * Provide both Promise/Deferred/Flow pattern and Event/Notify/Observer/PubSub pattern
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("eventmaster", [
  "mo/lang/es5",
  "mo/lang/mix",
  "mo/lang/struct"
], function(es5, _, struct){

    var fnQueue = struct.fnQueue,
        slice = Array.prototype.slice,
        pipes = ['notify', 'fire', 'error', 
            'resolve', 'reject', 'reset', 'disable', 'enable'];

    function Promise(opt){
        var self = this;
        if (opt) {
            this.subject = opt.subject;
            this.trace = opt.trace;
            this.traceStack = opt.traceStack || [];
        }
        this.doneHandlers = fnQueue();
        this.failHandlers = fnQueue();
        this.observeHandlers = fnQueue();
        this._alterQueue = fnQueue();
        this._lastDoneQueue = [];
        this._lastFailQueue = [];
        this.status = 0;
        this._argsCache = [];
        this.pipe = {};
        pipes.forEach(function(i){
            this[i] = function(){
                return self[i].call(self, slice.call(arguments));
            };
        }, this.pipe);
    }

    var actors = Promise.prototype = {

        then: function(handler, errorHandler){
            var _status = this.status;
            if (errorHandler) { // error, reject
                if (_status === 2) {
                    this._resultCache = errorHandler.apply(this, this._argsCache);
                } else if (!_status) {
                    this.failHandlers.push(errorHandler);
                    this._lastFailQueue = this.failHandlers;
                }
            } else {
                this._lastFailQueue = [];
            }
            if (handler) { // fire, resolve
                if (_status === 1) {
                    this._resultCache = handler.apply(this, this._argsCache);
                } else if (!_status) {
                    this.doneHandlers.push(handler);
                    this._lastDoneQueue = this.doneHandlers;
                }
            } else {
                this._lastDoneQueue = [];
            }
            return this;
        },

        done: function(handler){ // fire, resolve
            return this.then(handler);
        },

        fail: function(handler){ // error, reject
            return this.then(false, handler);
        },

        cancel: function(handler, errorHandler){ // then
            if (handler) { // done
                this.doneHandlers.clear(handler);
            }
            if (errorHandler) { // fail
                this.failHandlers.clear(errorHandler);
            }
            return this;
        },

        bind: function(handler){
            if (this.status) { // resolve, reject
                handler.apply(this, this._argsCache);
            }
            this.observeHandlers.push(handler); // notify, fire, error
            return this;
        },

        unbind: function(handler){ // bind
            this.observeHandlers.clear(handler);
            return this;
        },

        progress: function(handler){ // notify, fire?, error?
            var self = this;
            this.observeHandlers.push(function(){
                if (!self.status) {
                    handler.apply(this, arguments);
                }
            });
            return this;
        },

        notify: function(args){ // progress, bind
            if (this._disalbed) {
                return this;
            }
            this.status = 0;
            this.observeHandlers.apply(this, args || []);
            return this;
        },

        fire: function(args){ // bind, progress?, then, done
            if (this._disalbed) {
                return this;
            }
            if (this.trace) {
                this._trace();
            }
            args = args || [];
            var onceHandlers = this.doneHandlers;
            this.doneHandlers = this._alterQueue;
            this.failHandlers.length = 0;
            this.observeHandlers.apply(this, args);
            onceHandlers.apply(this, args);
            onceHandlers.length = 0;
            this._alterQueue = onceHandlers;
            return this;
        },

        error: function(args){ // bind, progress?, then, fail 
            if (this._disalbed) {
                return this;
            }
            if (this.trace) {
                this._trace();
            }
            args = args || [];
            var onceHandlers = this.failHandlers;
            this.failHandlers = this._alterQueue;
            this.doneHandlers.length = 0;
            this.observeHandlers.apply(this, args);
            onceHandlers.apply(this, args);
            onceHandlers.length = 0;
            this._alterQueue = onceHandlers;
            return this;
        },

        resolve: function(args){ // bind, then, done 
            this.status = 1;
            this._argsCache = args || [];
            return this.fire(args);
        },

        reject: function(args){ // bind, then, fail 
            this.status = 2;
            this._argsCache = args || [];
            return this.error(args);
        },

        reset: function(){ // resolve, reject
            this.status = 0;
            this._argsCache = [];
            this.doneHandlers.length = 0;
            this.failHandlers.length = 0;
            return this;
        },

        disable: function(){
            this._disalbed = true;
        },

        enable: function(){
            this._disalbed = false;
        },

        merge: function(promise){ // @TODO need testing
            _.merge(this.doneHandlers, promise.doneHandlers);
            _.merge(this.failHandlers, promise.failHandlers);
            _.merge(this.observeHandlers, promise.observeHandlers);
            var subject = promise.subject;
            _.mix(promise, this);
            promise.subject = subject;
        },

        _trace: function(){
            this.traceStack.unshift(this.subject);
            if (this.traceStack.length > this.trace) {
                this.traceStack.pop();
            }
        },

        follow: function(){
            var next = new Promise();
            next._prevActor = this;
            if (this.status) {
                pipe(this._resultCache, next);
            } else {
                var doneHandler = this._lastDoneQueue.pop();
                if (doneHandler) {
                    this._lastDoneQueue.push(function(){
                        return pipe(doneHandler.apply(this, arguments), next);
                    });
                }
                var failHandler = this._lastFailQueue.pop();
                if (failHandler) {
                    this._lastFailQueue.push(function(){
                        return pipe(failHandler.apply(this, arguments), next);
                    });
                }
            }
            return next;
        },

        end: function(){
            return this._prevActor;
        },

        all: function(){
            var fork = when.apply(this, this._when);
            return fork;
        },

        any: function(){
            var fork = when.apply(this, this._when);
            fork._count = fork._total = 1;
            return fork;
        },

        some: function(n){
            var fork = when.apply(this, this._when);
            fork._count = fork._total = n;
            return fork;
        }

    };

    function when(){
        var mutiArgs = [],
            completed = [],
            mutiPromise = new Promise();
        mutiPromise._when = [];
        mutiPromise._count = mutiPromise._total = arguments.length;
        Array.prototype.forEach.call(arguments, function(promise, i){
            var mutiPromise = this;
            mutiPromise._when.push(promise.bind(callback));
            function callback(args){
                if (!completed[i]) {
                    completed[i] = true;
                    mutiArgs[i] = args;
                    if (--mutiPromise._count === 0) {  // @TODO
                        completed.length = 0;
                        mutiPromise._count = mutiPromise._total;
                        mutiPromise.resolve.call(mutiPromise, mutiArgs);
                    }
                }
            }
        }, mutiPromise);
        return mutiPromise;
    }

    function pipe(prev, next){
        if (prev && prev.then) {
            prev.then(next.pipe.resolve, next.pipe.reject)
                .progress(next.pipe.notify);
        } else if (prev !== undefined) {
            next.resolve([prev]);
        }
        return prev;
    }

    function dispatchFactory(i){
        return function(subject){
            var promise = this.lib[subject];
            if (!promise) {
                promise = this.lib[subject] = new Promise({
                    subject: subject,
                    trace: this.trace,
                    traceStack: this.traceStack
                });
            }
            promise[i].apply(promise, slice.call(arguments, 1));
            return this;
        };
    }

    function Event(opt){
        if (opt) {
            this.trace = opt.trace;
            this.traceStack = opt.traceStack;
        }
        this.lib = {};
    }

    var EventAPI = Event.prototype = (function(methods){
        for (var i in actors) {
            methods[i] = dispatchFactory(i);
        }
        return methods;
    })({});

    EventAPI.once = EventAPI.wait = EventAPI.then;
    EventAPI.on = EventAPI.bind;
    EventAPI.off = EventAPI.unbind;

    EventAPI.promise = function(subject){
        var promise = this.lib[subject];
        if (!promise) {
            promise = this.lib[subject] = new Promise({
                subject: subject,
                trace: this.trace,
                traceStack: this.traceStack
            });
        }
        return promise;
    };

    EventAPI.when = function(){
        var args = [];
        for (var i = 0, l = arguments.length; i < l; i++) {
            args.push(this.promise(arguments[i]));
        }
        return when.apply(this, args);
    };

    function exports(opt){
        return new Event(opt);
    }

    exports.Promise = Promise;
    exports.Event = Event;
    exports.when = when;
    exports.pipe = pipe;

    exports.VERSION = '2.0.0';

    return exports;
});

/* @source db.js */;

/**
 * forked from Aaron Powell's db.js (http://aaronpowell.github.com/db.js/)
 * removing Deferred, using event.js instead
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://dexteryy.github.com/OzJS/ for details
 *
 * vim: et:ts=4:sw=4:sts=4
 */
define('db', [
  "eventmaster"
], function(event){
    'use strict';

    var window = this,
        indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB,
        IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange,
        transactionModes = {
            readonly: 'readonly',
            readwrite: 'readwrite'
        };
        
    var hasOwn = Object.prototype.hasOwnProperty;

    var oldApi = !!IDBDatabase.prototype.setVersion;

    var Deferred = function(){
        return new event.Promise();
    };

    if ( !indexedDB ) {
        throw 'IndexedDB required';
    }

    var Server = function ( db , name ) {
        var that = this,
            closed = false;

        this.add = function( table ) {
            if ( closed ) {
                throw 'Database has been closed';
            }

            var records = [];
            for (var i = 0; i < arguments.length - 1; i++) {
                records[i] = arguments[i + 1];
            }

            var transaction = db.transaction( table , transactionModes.readwrite ),
                store = transaction.objectStore( table ),
                deferred = Deferred();
            
            records.forEach( function ( record ) {
                var req;
                if ( record.item && record.key ) {
                    var key = record.key;
                    record = record.item;
                    req = store.add( record , key );
                } else {
                    req = store.add( record );
                }

                req.onsuccess = function ( e ) {
                    var target = e.target;
                    var keyPath = target.source.keyPath;
                    if ( keyPath === null ) {
                        keyPath = '__id__';
                    }
                    Object.defineProperty( record , keyPath , {
                        value: target.result,
                        enumerable: true
                    });
                    deferred.notify();
                };
            } );
            
            transaction.oncomplete = function () {
                deferred.resolve([records, that]);
            };
            transaction.onerror = function ( e ) {
                deferred.reject([records , e]);
            };
            transaction.onabort = function ( e ) {
                deferred.reject([records , e]);
            };
            return deferred;
        };

        this.update = function( table ) {
            if ( closed ) {
                throw 'Database has been closed';
            }

            var records = [];
            for ( var i = 0 ; i < arguments.length - 1 ; i++ ) {
                records[ i ] = arguments[ i + 1 ];
            }

            var transaction = db.transaction( table , transactionModes.readwrite ),
                store = transaction.objectStore( table ),
                keyPath = store.keyPath,
                deferred = Deferred();

            records.forEach( function ( record ) {
                var req;
                if ( record.item && record.key ) {
                    var key = record.key;
                    record = record.item;
                    req = store.put( record , key );
                } else {
                    req = store.put( record );
                }

                req.onsuccess = function ( e ) {
                    deferred.notify();
                };
            } );
            
            transaction.oncomplete = function () {
                deferred.resolve([records , that]);
            };
            transaction.onerror = function ( e ) {
                deferred.reject([records , e]);
            };
            transaction.onabort = function ( e ) {
                deferred.reject([records , e]);
            };
            return deferred;
        };
        
        this.remove = function ( table , key ) {
            if ( closed ) {
                throw 'Database has been closed';
            }
            var transaction = db.transaction( table , transactionModes.readwrite ),
                store = transaction.objectStore( table ),
                deferred = Deferred();
            
            var req = store.delete( key );
            req.onsuccess = function ( ) {
                deferred.resolve([key]);
            };
            req.onerror = function ( e ) {
                deferred.reject([e]);
            };
            return deferred;
        };

        this.clear = function ( table ) {
            if ( closed ) {
                throw 'Database has been closed';
            }
            var transaction = db.transaction( table , transactionModes.readwrite ),
                store = transaction.objectStore( table ),
                deferred = Deferred();
            
            var req = store.clear();
            req.onsuccess = function ( ) {
                deferred.resolve();
            };
            req.onerror = function ( e ) {
                deferred.reject([e]);
            };
            return deferred;
        };
        
        this.close = function ( ) {
            if ( closed ) {
                throw 'Database has been closed';
            }
            db.close();
            closed = true;
            delete dbCache[ name ];
        };

        this.get = function ( table , id ) {
            if ( closed ) {
                throw 'Database has been closed';
            }
            var transaction = db.transaction( table , transactionModes.readonly ),
                store = transaction.objectStore( table ),
                deferred = Deferred();

            var req = store.get( id );
            req.onsuccess = function ( e ) {
                deferred.resolve([e.target.result]);
            };
            req.onerror = function ( e ) {
                deferred.reject([e]);
            };
            return deferred;
        };

        this.query = function ( table , index ) {
            if ( closed ) {
                throw 'Database has been closed';
            }
            return new IndexQuery( table , db , index );
        };

        for ( var i = 0 , il = db.objectStoreNames.length ; i < il ; i++ ) {
            (function ( storeName ) {
                that[ storeName ] = { };
                for ( var i in that ) {
                    if ( !hasOwn.call( that , i ) || i === 'close' ) {
                        continue;
                    }
                    that[ storeName ][ i ] = (function ( i ) {
                        return function () {
                            var args = [ storeName ].concat( [].slice.call( arguments , 0 ) );
                            return that[ i ].apply( that , args );
                        };
                    })( i );
                }
            })( db.objectStoreNames[ i ] );
        }
    };

    var IndexQuery = function ( table , db , indexName ) {
        var that = this;
        var runQuery = function ( type, args , cursorType , direction ) {
            var transaction = db.transaction( table ),
                store = transaction.objectStore( table ),
                index = indexName ? store.index( indexName ) : store,
                keyRange = type ? IDBKeyRange[ type ].apply( null, args ) : null,
                results = [],
                deferred = Deferred(),
                indexArgs = [ keyRange ];

            if ( cursorType !== 'count' ) {
                indexArgs.push( direction || 'next' );
            }

            index[cursorType].apply( index , indexArgs ).onsuccess = function ( e ) {
                var cursor = e.target.result;

                if ( typeof cursor === typeof 0 ) {
                    results = cursor;
                } else if ( cursor ) {
                    results.push( 'value' in cursor ? cursor.value : cursor.key );
                    cursor.continue();
                }
            };

            transaction.oncomplete = function () {
                deferred.resolve([results]);
            };
            transaction.onerror = function ( e ) {
                deferred.reject([e]);
            };
            transaction.onabort = function ( e ) {
                deferred.reject([e]);
            };
            return deferred;
        };

        var Query = function ( type , args ) {
            var direction = 'next',
                cursorType = 'openCursor',
                filters = [],
                unique = false;

            var execute = function () {
                var deferred = Deferred();
                
                runQuery( type , args , cursorType , unique ? direction + 'unique' : direction )
                    .then( function ( data ) {
                        if ( data.constructor === Array ) {
                            filters.forEach( function ( filter ) {
                                if ( !filter || !filter.length ) {
                                    return;
                                }

                                if ( filter.length === 2 ) {
                                    data = data.filter( function ( x ) {
                                        return x[ filter[ 0 ] ] === filter[ 1 ];
                                    });
                                } else {
                                    data = data.filter( filter[ 0 ] );
                                }
                            });
                        }
                        deferred.resolve([data]);
                    }, deferred.pipe.reject)
                    .progress(deferred.pipe.notify);

                return deferred;
            };
            var count = function () {
                direction = null;
                cursorType = 'count';

                return {
                    execute: execute
                };
            };
            var keys = function () {
                cursorType = 'openKeyCursor';

                return {
                    desc: desc,
                    execute: execute,
                    filter: filter,
                    distinct: distinct
                };
            };
            var filter = function ( ) {
                filters.push( Array.prototype.slice.call( arguments , 0 , 2 ) );

                return {
                    keys: keys,
                    execute: execute,
                    filter: filter,
                    desc: desc,
                    distinct: distinct
                };
            };
            var desc = function () {
                direction = 'prev';

                return {
                    keys: keys,
                    execute: execute,
                    filter: filter,
                    distinct: distinct
                };
            };
            var distinct = function () {
                unique = true;
                return {
                    keys: keys,
                    count: count,
                    execute: execute,
                    filter: filter,
                    desc: desc
                };
            };

            return {
                execute: execute,
                count: count,
                keys: keys,
                filter: filter,
                desc: desc,
                distinct: distinct
            };
        };
        
        'only bound upperBound lowerBound'.split(' ').forEach(function (name) {
            that[name] = function () {
                return new Query( name , arguments );
            };
        });

        this.filter = function () {
            var query = new Query( null , null );
            return query.filter.apply( query , arguments );
        };

        this.all = function () {
            return this.filter();
        };
    };
    
    var createSchema = function ( e , schema , db ) {
        if ( typeof schema === 'function' ) {
            schema = schema();
        }
        
        for ( var tableName in schema ) {
            var table = schema[ tableName ];
            if ( !hasOwn.call( schema , tableName ) ) {
                continue;
            }

            var store = db.createObjectStore( tableName , table.key );

            for ( var indexKey in table.indexes ) {
                var index = table.indexes[ indexKey ];
                store.createIndex( indexKey , index.key || indexKey , Object.keys(index).length ? index : { unique: false } );
            }
        }
    };
    
    var open = function ( e , server , version , schema ) {
        var db = e.target.result;
        var s = new Server( db , server );
        var upgrade;

        var deferred = Deferred();
        deferred.resolve( s );
        dbCache[ server ] = db;

        return deferred;
    };

    var dbCache = {};

    var db = {
        version: '0.8.0',
        open: function ( options ) {
            var request;

            var deferred = Deferred();

            if ( dbCache[ options.server ] ) {
                open( {
                    target: {
                        result: dbCache[ options.server ]
                    }
                } , options.server , options.version , options.schema )
                .done(deferred.pipe.resolve)
                .fail(deferred.pipe.reject)
                .progress(deferred.pipe.notify);
            } else {
                request = indexedDB.open( options.server , options.version );
                            
                request.onsuccess = function ( e ) {
                    open( e , options.server , options.version , options.schema )
                        .done(deferred.pipe.resolve)
                        .fail(deferred.pipe.reject)
                        .progress(deferred.pipe.notify);
                };
            
                request.onupgradeneeded = function ( e ) {
                    createSchema( e , options.schema , e.target.result );
                };
                request.onerror = function ( e ) {
                    deferred.reject([e]);
                };
            }

            return deferred;
        }
    };

    return db;

});

/* @source mo/mainloop.js */;

/**
 * Implement and manage single loop for WebApp life cycle
 * Provide tweening API for both property animation and frame animation(canvas or css)
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/mainloop", [
  "mo/lang"
], function(_){

    var ANIMATE_FRAME = "RequestAnimationFrame",
        LONG_AFTER = 4000000000000,

        animateFrame = window['webkit' + ANIMATE_FRAME] || 
            window['moz' + ANIMATE_FRAME] || 
            window['o' + ANIMATE_FRAME] || 
            window['ms' + ANIMATE_FRAME],
        suid = 1,
        ruid = 1,
        fps_limit = 0,
        activeStages = [],
        renderlib = {},
        stageLib = {},

        _default_easing = {
            linear: function(x, t, b, c) {
                return b + c * x;
            },
            easeIn: function (x, t, b, c, d) {
                return c*(t/=d)*t + b;
            },
            easeOut: function (x, t, b, c, d) {
                return -c *(t/=d)*(t-2) + b;
            },
            easeInOut: function (x, t, b, c, d) {
                if ((t/=d/2) < 1) return c/2*t*t + b;
                return -c/2 * ((--t)*(t-2) - 1) + b;
            }
        },

        _default_config = {
            fps: 0,
            easing: _default_easing
        };

    function loop(timestamp){
        for (var i = 0, stage, l = activeStages.length; i < l; i++) {
            stage = activeStages[i];
            if (stage) {
                if (timestamp - stage.lastLoop >= fps_limit) {
                    stage.lastLoop = timestamp;
                    stage.renders.call(stage, timestamp);
                }
            }
        }
    }

    var mainloop = {

        config: function(opt){
            _.config(this, opt, _default_config);
            if (opt.fps) {
                fps_limit = this.fps ? (1000/this.fps) : 0;
            }
            if (opt.easing) {
                this.easing = _.mix(this.easing || {}, opt.easing);
            }
            return this;
        },

        run: function(name){
            if (name) {
                var stage = stageLib[name];
                if (!stage) {
                    this.addStage(name);
                    stage = stageLib[name];
                }
                if (stage && !stage.state) {
                    stage.state = 1;
                    activeStages.push(stage);
                    stage.renders.forEach(function(render){
                        var _delay = this.delays[render._rid];
                        if (_delay) {
                            _delay[3] = +new Date();
                            _delay[0] = setTimeout(_delay[1], _delay[2]);
                        }
                    }, stage);
                }
                if (this.globalSignal) {
                    return this;
                }
            }

            var self = this,
                frameFn = animateFrame,
                clearInterv = clearInterval,
                _loop = loop,
                timer,
                signal = ++suid;

            this.globalSignal = 1;

            function step(){
                if (suid === signal) {
                    var timestamp = +new Date();
                    _loop(timestamp);
                    if (self.globalSignal) {
                        if (frameFn) {
                            frameFn(step);
                        }
                    } else {
                        clearInterv(timer);
                    }
                }
            }

            if (frameFn) {
                frameFn(step);
            } else {
                timer = setInterval(step, 15);
            }
            return this;
        },

        pause: function(name){
            if (name) {
                var n = activeStages.indexOf(stageLib[name]);
                if (n >= 0) {
                    var stage = stageLib[name];
                    activeStages.splice(n, 1);
                    stage.state = 0;
                    stage.pauseTime = +new Date();
                    stage.renders.forEach(function(render){
                        var _delay = this.delays[render._rid];
                        if (_delay) {
                            clearTimeout(_delay[0]);
                            _delay[2] -= (this.pauseTime - _delay[3]);
                        }
                    }, stage);
                }
            } else {
                this.globalSignal = 0;
            }
            return this;
        },

        complete: function(name){
            var stage = stageLib[name];
            if (stage && stage.state) {
                stage.renders.forEach(function(render){
                    var _delay = stage.delays[render._rid];
                    if (_delay) {
                        clearTimeout(_delay[0]);
                        _delay[1]();
                    }
                    render.call(stage, this);
                }, LONG_AFTER);
                return this.remove(name);
            }
            return this;
        },

        remove: function(name, fn){
            if (fn) {
                var stage = stageLib[name];
                if (stage) {
                    clearTimeout((stage.delays[fn._rid] || [])[0]);
                    stage.renders.clear(fn);
                }
            } else {
                this.pause(name);
                delete stageLib[name];
            }
            return this;
        },

        info: function(name){
            return stageLib[name];
        },

        isRunning: function(name){
            return !!(stageLib[name] || {}).state;
        },

        addStage: function(name, ctx){
            if (name) {
                stageLib[name] = {
                    name: name,
                    ctx: ctx,
                    state: 0,
                    lastLoop: 0,
                    pauseTime: 0,
                    delays: {},
                    renders: _.fnQueue()
                };
            }
            return this;
        },

        addRender: function(name, fn, ctx){
            if (!stageLib[name]) {
                this.addStage(name, ctx);
            }
            this._lastestRender = fn;
            stageLib[name].renders.push(fn);
            return this;
        },

        getRender: function(renderId){
            return renderlib[renderId] || this._lastestRender;
        },

        addTween: function(name, current, end, duration, opt){
            var self = this,
                start, _delays,
                rid = opt.renderId,
                easing = opt.easing,
                lastPause = 0,
                d = end - current;
            function render(timestamp){
                if (lastPause !== this.pauseTime && start < this.pauseTime) {
                    lastPause = this.pauseTime;
                    start += +new Date() - lastPause;
                }
                var v, time = timestamp - start,
                    p = time/duration;
                if (time <= 0) {
                    return;
                }
                if (p < 1) {
                    if (easing) {
                        p = self.easing[easing](p, time, 0, 1, duration);
                    }
                    if (d < 0) {
                        p = 1 - p;
                        v = end + -1 * d * p;
                    } else {
                        v = current + d * p;
                    }
                }
                if (time >= duration) {
                    opt.step(end, duration);
                    self.remove(name, render);
                    if (opt.callback) {
                        opt.callback();
                    }
                } else {
                    opt.step(v, time);
                }
            }
            if (opt.delay) {
                if (!stageLib[name]) {
                    this.addStage(name);
                }
                if (!rid) {
                    rid = opt.renderId = '_oz_mainloop_' + ruid++;
                }
                _delays = stageLib[name].delays;
                var _timer = setTimeout(add_render, opt.delay);
                _delays[rid] = [_timer, add_render, opt.delay, +new Date()];
            } else {
                add_render();
            }
            if (rid) {
                render._rid = rid;
                renderlib[rid] = render;
            }
            function add_render(){
                if (_delays) {
                    delete _delays[rid];
                }
                if (duration) {
                    opt.step(current, 0);
                } else {
                    opt.step(end, 0);
                    if (opt.callback) {
                        setTimeout(function(){
                            opt.callback();
                        }, 0);
                    }
                    return;
                }
                start = +new Date();
                self.addRender(name, render);
            }
            return this;
        }

    };

    mainloop.config(_default_config);

    return mainloop;

});

/* @source choreo.js */;

/**
 * ChoreoJS
 * An animation library which uses "stage" and "actor" as metaphors
 * Automatic switch between CSS transitions and JS tweening
 * Provide a flexible way to write asynchronous sequence of actions
 * Support CSS transform value
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("choreo", [
  "mo/lang/es5",
  "mo/lang/mix",
  "mo/mainloop",
  "eventmaster"
], function(es5, _, mainloop, Event){

    var window = this,
        VENDORS = ['', 'Moz', 'webkit', 'ms', 'O'],
        EVENT_NAMES = {
            '': 'transitionend',
            'Moz': 'transitionend',
            'webkit': 'webkitTransitionEnd',
            'ms': 'MSTransitionEnd',
            'O': 'oTransitionEnd'
        },
        TRANSIT_EVENT,
        TRANSFORM_PROPS = { 'rotate': -2, 
            'rotateX': -1, 'rotateY': -1, 'rotateZ': -1, 
            'scale': 2, 'scale3d': 3, 
            'scaleX': -1, 'scaleY': -1, 'scaleZ': -1, 
            'skew': 2, 'skewX': -1, 'skewY': -1, 
            'translate': 2, 'translate3d': 3, 
            'translateX': -1, 'translateY': -1, 'translateZ': -1 },
        TRANSFORM_DEFAULT = 'rotateX(0deg) rotateY(0deg) rotateZ(0deg)'
            + ' translateX(0px) translateY(0px) translateZ(0px)'
            + ' scaleX(1) scaleY(1) scaleZ(1) skewX(0deg) skewY(0deg)',
        ACTOR_OPS = ['target', 'prop', 'duration', 'easing', 'delay', 'to'],
        RE_TRANSFORM = /(\w+)\(([^\)]+)/,
        RE_PROP_SPLIT = /\)\s+/,
        RE_UNIT = /^[-\d\.]+/,
        test_elm = window.document.body,
        _arry_push = Array.prototype.push,
        _array_slice = Array.prototype.slice,
        _getComputedStyle = (document.defaultView || {}).getComputedStyle,
        vendor_prop = { 'transform': '', 'transition': '' },
        useCSS = false,
        parent_id = 0,
        hash_id = 0,
        stage_id = 0,
        render_id = 0,
        _hash_pool = [],
        _stage = {},
        _transition_sets = {},
        _transform_promise = {},
        timing_values = {
            linear: 'linear',
            easeIn: 'ease-in',
            easeOut: 'ease-out',
            easeInOut: 'ease-in-out'
        },
        timing_functions = {
            linear: function(x, t, b, c) {
                return b + c * x;
            },
            easeIn: function (x, t, b, c, d) {
                return c*(t/=d)*t + b;
            },
            easeOut: function (x, t, b, c, d) {
                return -c *(t/=d)*(t-2) + b;
            },
            easeInOut: function (x, t, b, c, d) {
                if ((t/=d/2) < 1) return c/2*t*t + b;
                return -c/2 * ((--t)*(t-2) - 1) + b;
            }
        };

    function fix_prop_name(lib, prefix, true_prop, succ){
        for (var prop in lib) {
            true_prop = prefix ? ('-' + prefix + '-' + prop) : prop;
            if (css_method(true_prop) in test_elm.style) {
                lib[prop] = true_prop;
                TRANSIT_EVENT = EVENT_NAMES[prefix];
                succ = true;
                continue;
            }
        }
        return succ;
    }
    
    for (var i = 0, l = VENDORS.length; i < l; i++) {
        if (fix_prop_name(vendor_prop, VENDORS[i])) {
            break;
        }
    }
    fix_prop_name(vendor_prop, '');

    var TRANSFORM = vendor_prop['transform'],
        TRANSITION = vendor_prop['transition'],
        TRANSFORM_METHOD = css_method(TRANSFORM),
        TRANSITION_METHOD = css_method(TRANSITION); 
    if (TRANSFORM_METHOD && TRANSITION_METHOD) {
        useCSS = true;
    }

    function Stage(name){
        if (!name) {
            name = '_oz_choreo_' + stage_id++;
        }
        if (_stage[name]) {
            return _stage[name];
        }
        var self = this;
        _stage[name] = this;
        this.name = name;
        this._promise = new Event.Promise();
        this._reset_promise = new Event.Promise();
        this._count = 0;
        this._optCache = [];
        if (useCSS) {
            this._runningActors = [];
        } else {
            mainloop.addStage(name);
        }
        this._reset_promise.bind(function(){
            self._promise.reset();
        });
    }

    Stage.prototype = {

        isPlaying: function(){
            return useCSS ? !!this._runningActors.state 
                : mainloop.isRunning(this.name);
        },

        isCompleted: function(){
            return this._count <= 0;
        },

        play: function(){
            // reinitialize all user-written opts if stage has completed
            if (this.isCompleted()) {
                clearTimeout(this._end_timer);
                this._reset_promise.fire();
                this._optCache.forEach(function(opt){
                    this.actor(opt);
                }, this);
            }
            // nothing happen if stage is running
            if (useCSS) {
                if (!this.isPlaying()) {
                    this._runningActors.state = 1;
                    this._runningActors.forEach(play);
                }
            } else {
                mainloop.run(this.name);
            }
            return this;
        },

        pause: function(){
            if (useCSS) {
                this._runningActors.state = 0;
                this._runningActors.forEach(stop);
            } else {
                mainloop.pause(this.name);
            }
            return this;
        },

        clear: function(){
            this.cancel();
            // remove all all user-written opts
            this._optCache.forEach(function(opt){
                opt._cached = false;
            });
            this._optCache.length = 0;
            return this;
        },

        cancel: function(){
            to_end(this, function(name, opt){
                if (useCSS) {
                    stop(opt);
                } else {
                    mainloop.remove(name);
                }
            });
            this._optCache.forEach(function(opt){
                opt._promise.reject([{
                    target: opt.target, 
                    succ: false
                }]).disable();
            });
            return this;
        },

        complete: function(){
            to_end(this, function(name, opt){
                if (useCSS) {
                    complete(opt);
                    opt._promise.resolve([{
                        target: opt.target, 
                        succ: true 
                    }]).disable();
                } else {
                    mainloop.complete(name);
                }
            });
            return this;
        },

        actor: function(opt, opt2){
            var self = this, name = this.name, actorObj, actors;

            // when new actor coming, cancel forthcoming complete event 
            clearTimeout(this._end_timer);

            // Actor Group
            if (opt2) {
                if (opt.nodeType) { // convert jquery style to mutiple Single Actor
                    var base_opt = {}, props;
                    ACTOR_OPS.forEach(function(op, i){
                        if (op === 'prop') {
                            props = this[i];
                        } else if (op !== 'to') {
                            base_opt[op] = this[i];
                        }
                    }, arguments);
                    actors = Object.keys(props).map(function(prop){
                        return self.actor(_.mix({ 
                            _parent: true,
                            prop: prop,
                            to: props[prop]
                        }, this));
                    }, base_opt);
                    if (actors.length === 1) {
                        return actors[0];
                    }
                } else { // convert multiple options to mutiple Single Actor
                    actors = _array_slice.call(arguments);
                    actors = actors.map(function(sub_opt){
                        sub_opt._parent = true;
                        return self.actor(sub_opt);
                    });
                }
                this._reset_promise.bind(when_reset);
                return actorObj = new Actor(actors, self);
            }

            // normalize opt 
            opt.prop = vendor_prop[opt.prop] || opt.prop;

            // reset opt
            if (opt._promise) {
                when_reset(opt._promise);
            }
            // @TODO avoid setting the same prop

            // convert from Transform Actor to Actor Group
            if (opt.prop === TRANSFORM) { 
                var transform_promise = promise_proxy(opt.target);
                actors = split_transform(opt.to, function(sub_opt){
                    _.merge(sub_opt, opt);
                    sub_opt._parent = true;
                    sub_opt._promise = transform_promise;
                    return self.actor(sub_opt);
                });
                this._reset_promise.bind(when_reset);
                return actorObj = new Actor(actors, self);
            }

            self._count++; // count actors created by user

            // Single Actor or Split Actor
            if (!opt._promise) {
                opt._promise = new Event.Promise();
            }
            if (useCSS) {
                this._runningActors.push(opt);
                if (this.isPlaying()) {
                    play(opt);
                }
            } else {
                render_opt(name, opt);
            }
            actorObj = new Actor(opt, self);

            if (!opt._cached) {
                // cache Single Actor and Split Actor
                opt._cached = true;
                this._optCache.push(opt);

                watch(actorObj);
            }

            function when_reset(promise){
                (promise || actorObj.follow()).reset().enable();
            }

            function watch(actor){
                actor.follow().bind(watcher);
                actor._opt._watcher = watcher;
                delete actor._opt._parent;
                return actor;
            }

            function watcher(res){
                if (--self._count > 0) {
                    return;
                }
                self._end_timer = setTimeout(function(){
                    to_end(self);
                    self._promise[
                        res.succ ? 'resolve': 'reject'
                    ]([{ succ: res.succ }]);
                }, 0);
            }

            return actorObj;
        },

        group: function(actor){
            var self = this,
                actorObj,
                actors = _array_slice.call(arguments).filter(function(actor){
                    return actor.stage === self;
                });
            this._reset_promise.bind(function(){
                actorObj.follow().reset().enable();
            });
            return actorObj = new Actor(actors, self);
        },

        follow: function(){
            return this._promise;
        }

    };

    function Actor(opt, stage){
        if (Array.isArray(opt)) { // Actor Group
            this.members = opt;
            opt = {
                _promise: Event.when.apply(Event, 
                    this.members.map(function(actor){
                        return actor.follow();
                    })
                )
            };
            opt._promise.bind(opt._promise.pipe.disable);
        }
        this._opt = opt;
        this.stage = stage;
    }

    Actor.prototype = {

        enter: function(stage){
            if (this.stage) {
                this.exit();
            }
            var actor = stage.actor.apply(
                stage, 
                [].concat(actor_opts(this))
            );
            actor.follow().merge(this.follow());
            return _.mix(this, actor);
        },

        exit: function(){
            var stage = this.stage,
                opt = this._opt;
            if (!stage) {
                return this;
            }
            if (this.members) {
                this.members = this.members.map(function(actor){
                    return actor.exit();
                });
            } else {
                if (useCSS) {
                    clear_member(stage._runningActors, opt);
                    if (stage.isPlaying()) {
                        stop(opt);
                    }
                } else {
                    mainloop.remove(stage.name, opt._render);
                }
                clear_member(stage._optCache, opt);
                opt._promise.reject([{
                    target: opt.target, 
                    succ: false
                }]).disable();
                // @TODO remove when_reset
            }
            var actor = this.fork();
            if (!opt._parent) {
                actor.follow().merge(opt._promise);
            }
            _.occupy(opt, actor._opt);
            delete this.stage;
            return this;
        },

        fork: function(){
            if (this.members) {
                return new Actor(this.members.map(function(actor){
                    return actor.fork();
                }));
            }
            var opt = {};
            ACTOR_OPS.forEach(function(i){
                opt[i] = this[i];
            }, this._opt);
            opt._promise = new Event.Promise(); // useless for member actor
            return new Actor(opt);
        },

        setto: function(v){
            return actor_setter(this, v, function(opt, v){
                return (v || v === 0) ? v : opt.to;
            });
        },

        extendto: function(v){
            return actor_setter(this, v, function(opt, v){
                if (!v) {
                    return opt.to;
                }
                var unit = get_unit(opt.to, v);
                return parseFloat(opt.to) + parseFloat(v) + unit;
            });
        },

        reverse: function(){
            return actor_setter(this, {}, function(opt){
                return opt.from !== undefined 
                    ? opt.from : opt._current_from;
            });
        },

        follow: function(){
            return this._opt._promise;
        }
        
    };

    function to_end(stage, fn){
        if (useCSS) {
            var _actors = stage._runningActors;
            if (stage.isPlaying()) {
                _actors.forEach(function(opt){
                    if (fn) {
                        fn(stage.name, opt);
                    }
                });
                _actors.state = 0;
                _actors.length = 0;
            }
        } else if (fn) {
            fn(stage.name);
        }
    }

    function stop(opt){
        var elm = opt.target,
            from = parseFloat(opt._current_from || opt.from),
            end = parseFloat(opt.to),
            d = end - from,
            time = opt._startTime ? (+new Date() - opt._startTime) : 0;
        if (time < 0) {
            time = 0;
        }
        var progress = time / (opt.duration || 1),
            hash = elm2hash(elm),
            sets = _transition_sets[hash];
        if (sets && sets[opt.prop] === opt) {
            clearTimeout((sets[opt.prop] || {})._runtimer);
            delete sets[opt.prop];
        } else {
            progress = 0;
        }
        if (!progress) {
            return;
        }
        var str = transitionStr(hash);
        elm.style[TRANSITION_METHOD] = str;
        if (progress < 1) { // pause
            if (timing_functions[opt.easing]) {
                progress = timing_functions[opt.easing](progress, time, 0, 1, opt.duration);
            }
            var unit = get_unit(opt.from, opt.to);
            from = from + d * progress + unit;
        } else { // complete
            from = opt.to;
        }
        set_style_prop(elm, opt.prop, from);
    }

    function complete(opt){
        var elm = opt.target,
            hash = elm2hash(elm),
            sets = _transition_sets[hash];
        if (sets) {
            delete sets[opt.prop];
        }
        var str = transitionStr(hash);
        elm.style[TRANSITION_METHOD] = str;
        set_style_prop(elm, opt.prop, opt.to);
    }

    function play(opt){
        var elm = opt.target,
            prop = opt.prop,
            hash = elm2hash(elm),
            sets = _transition_sets[hash],
            from = opt.from || get_style_value(elm, prop);
        if (from == opt.to) { // completed
            var completed = true;
            if (sets) {
                delete sets[prop];
            }
            if (TRANSFORM_PROPS[prop]) {
                for (var p in sets) {
                    if (TRANSFORM_PROPS[p]) {
                        completed = false; // wait for other transform prop
                        break;
                    }
                }
            }
            if (completed) {
                opt._promise.resolve([{
                    target: opt.target, 
                    succ: true 
                }]).disable();
            }
            return;
        }
        opt._current_from = from; // for pause or reverse
        opt._startTime = +new Date() + (opt.delay || 0);
        sets[prop] = opt;
        set_style_prop(elm, prop, from);
        var str = transitionStr(hash);
        opt._runtimer = setTimeout(function(){
            delete opt._runtimer;
            elm.style[TRANSITION_METHOD] = str;
            set_style_prop(elm, prop, opt.to);
        }, 0);
    }

    function render_opt(name, opt){
        var elm = opt.target,
            end = parseFloat(opt.to),
            from = opt.from || get_style_value(opt.target, opt.prop),
            unit = get_unit(from, opt.to);
        if (unit && from.toString().indexOf(unit) < 0) {
            from = 0;
        }
        opt._current_from = from; // for pause or reverse
        var current = parseFloat(from),
            rid = opt.delay && ('_oz_anim_' + render_id++);
        mainloop.addTween(name, current, end, opt.duration, {
            easing: opt.easing,
            delay: opt.delay,
            step: function(v){
                set_style_prop(elm, opt.prop, v + unit);
            },
            renderId: rid,
            callback: function(){
                opt._promise.resolve([{
                    target: elm,
                    succ: true
                }]).disable();
            }
        });
        opt._render = mainloop.getRender(rid);
    }

    function split_transform(value, fn){
        var to_lib = parse_transform(value);
        return Object.keys(to_lib).map(function(prop){
            return fn({
                prop: prop,
                to: this[prop]
            });
        }, to_lib);
    }

    function parse_transform(value){
        var lib = {};
        value.split(RE_PROP_SPLIT).forEach(function(str){
            var kv = str.match(/([^\(\)]+)/g),
                values = kv[1].split(/\,\s*/),
                isSupported = TRANSFORM_PROPS[kv[0]],
                is3D = isSupported === 3,
                isSingle = isSupported < 0 || values.length <= 1,
                xyz = isSingle ? [''] : ['X', 'Y', 'Z'];
            if (!isSupported) {
                return;
            }
            values.forEach(function(v, i){
                if (v && i <= xyz.length && is3D || isSingle && i < 1 || !isSingle && i < 2) {
                    var k = kv[0].replace('3d', '') + xyz[i];
                    this[k] = v;
                }
            }, this);
        }, lib);
        return lib;
    }

    function elm2hash(elm){
        var hash = elm._oz_fx;
        if (!hash) {
            hash = ++hash_id;
            elm._oz_fx = hash;
            elm.removeEventListener(TRANSIT_EVENT, when_transition_end);
            elm.addEventListener(TRANSIT_EVENT, when_transition_end);
        }
        if (!_transition_sets[hash]) {
            _transition_sets[hash] = {};
        }
        return hash;
    }

    function when_transition_end(e){
        e.stopPropagation();
        var self = this,
            hash = this._oz_fx,
            sets = _transition_sets[hash];
        if (sets) {
            if (e.propertyName === TRANSFORM) { 
                for (var i in TRANSFORM_PROPS) {
                    delete sets[i];
                }
                var promises = _transform_promise[hash] || [];
                this.style[TRANSITION_METHOD] = transitionStr(hash);
                promises.forEach(function(promise){
                    promise.resolve([{
                        target: self,
                        succ: true
                    }]).disable();
                }); 
            } else {
                var opt = sets[e.propertyName];
                if (opt) {
                    delete sets[opt.prop];
                    this.style[TRANSITION_METHOD] = transitionStr(hash);
                    if (opt._promise) {
                        opt._promise.resolve([{
                            target: this,
                            succ: true
                        }]).disable();
                    }
                }
            }
        }
    }

    function get_style_value(node, name){
        if (TRANSFORM_PROPS[name]) {
            return transform(node, name) || 0;
        }
        if (name === TRANSFORM) {
            return node && node.style[
                TRANSFORM_METHOD || name
            ] || TRANSFORM_DEFAULT;
        }
        var method = css_method(name);
        var r = node && (node.style[method] 
            || (_getComputedStyle 
                ? _getComputedStyle(node, '').getPropertyValue(name)
                : node.currentStyle[name]));
        return (r && /\d/.test(r)) && r || 0;
    }

    function set_style_prop(elm, prop, v){
        if (TRANSFORM_PROPS[prop]) {
            if (TRANSFORM) {
                transform(elm, prop, v);
            }
        } else {
            elm.style[css_method(prop)] = v;
        }
    }

    function transform(elm, prop, v){
        var current = parse_transform(get_style_value(elm, TRANSFORM));
        if (v) {
            var kv = parse_transform(prop + '(' + v + ')');
            _.mix(current, kv);
            elm.style[TRANSFORM_METHOD] = Object.keys(current).map(function(prop){
                return prop + '(' + this[prop] + ')';
            }, current).join(' ');
        } else {
            return current[prop] || prop === 'rotate' && '0deg';
        }
    }

    function transitionStr(hash){
        var sets = _transition_sets[hash];
        if (sets) {
            var str = [], opt;
            for (var prop in sets) {
                opt = sets[prop];
                if (opt && opt.prop) {
                    str.push([
                        TRANSFORM_PROPS[opt.prop] && TRANSFORM || opt.prop,
                        (opt.duration || 0) + 'ms',
                        timing_values[opt.easing] || 'linear',
                        (opt.delay || 0) + 'ms'
                    ].join(' '));
                }
            }
            return str.join(",");
        } else {
            return '';
        }
    }

    function get_unit(from, to){
        var from_unit = (from || '').toString().replace(RE_UNIT, ''),
            to_unit = (to || '').toString().replace(RE_UNIT, '');
        return parseFloat(from) === 0 && to_unit 
            || parseFloat(to) === 0 && from_unit 
            || to_unit || from_unit;
    }

    function css_method(name){
        return name.replace(/-+(.)?/g, function($0, $1){
            return $1 ? $1.toUpperCase() : '';
        }); 
    }

    function clear_member(array, member){
        var n = array.indexOf(member);
        if (n !== -1) {
            array.splice(n, 1);
        }
    }

    function promise_proxy(target){
        var transform_promise;
        if (useCSS) {
            transform_promise = new Event.Promise();
            var hash = elm2hash(target);
            if (!_transform_promise[hash]) {
                _transform_promise[hash] = [];
            }
            _transform_promise[hash].push(transform_promise);
        }
        return transform_promise;
    }

    function actor_opts(actor){
        if (actor.members) {
            // convert from Actor Group to original Transform Actor 
            var eg = actor.members[0]._opt;
            if (!TRANSFORM_PROPS[eg.prop]) {
                return actor.members.map(function(sub){
                    return actor_opts(sub);
                });
            } else {
                var opt = actor._opt = _.copy(eg);
                opt.prop = TRANSFORM;
                opt.to = actor.members.map(function(actor){
                    return actor._opt.prop + '(' + actor._opt.to + ')';
                }).join(' ');
                delete opt._parent;
            }
        }
        return actor._opt;
    }

    function actor_setter(actor, v, fn){
        var opt = actor._opt, 
            stage = actor.stage;
        if (stage && !stage.isCompleted()) {
            stage.cancel();
        }
        if (actor.members) {
            if (typeof v === 'string' 
                && TRANSFORM_PROPS[actor.members[0]._opt.prop]) {
                var lib = {};
                split_transform(v, function(sub_opt){
                    lib[sub_opt.prop] = sub_opt.to;
                });
                v = lib;
            }
            actor.members.forEach(function(actor){
                var mem_opt = actor._opt;
                mem_opt.to = fn(mem_opt, this[mem_opt.prop]);
            }, v);
        } else {
            opt.to = fn(actor._opt, v);
        }
        return actor;
    }

    function exports(name){
        return new Stage(name);
    }

    _.mix(exports, {

        VERSION: '1.0.1',
        renderMode: useCSS ? 'css' : 'js',
        Stage: Stage,
        Actor: Actor,

        config: function(opt){
            if (opt.easing) {
                _.mix(timing_values, opt.easing.values);
                _.mix(timing_functions, opt.easing.functions);
                mainloop.config({ easing: timing_functions });
            }
            if (/(js|css)/.test(opt.renderMode)) {
                useCSS = opt.renderMode === 'css';
                this.renderMode = opt.renderMode;
            }
        },

        transform: transform

    });

    return exports;

});

/* @source soviet.js */;

/**
 * SovietJS
* Standalone UI event delegate implementation
* Provide multiple styles/modes: override, automatically preventDefault, partial matching, exact matching...
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define('soviet', [
  "mo/lang/es5",
  "mo/lang/mix",
  "mo/lang/type",
  "mo/lang/struct",
  "dollar"
], function(es5, _, type, struct, $){

    var fnQueue = struct.fnQueue,
        isFunction = type.isFunction,
        _matches_selector = $.find.matchesSelector,
        _default_config = {
            preventDefault: false,
            matchesSelector: false,
            autoOverride: false,
            trace: false,
            traceStack: null
        };

    function Soviet(elm, opt){
        _.config(this, opt || {}, _default_config);
        this.target = $(elm);
        this.events = {};
        this.locks = {};
        if (!this.traceStack) {
            this.traceStack = [];
        }
    }

    Soviet.prototype = {

        on: function(event, selector, handler){
            if (isFunction(selector)) {
                handler = selector;
                selector = undefined;
            }
            if (typeof selector === 'object') {
                for (var i in selector) {
                    this.on(event, i, selector[i]);
                }
            } else {
                var table = this.events[event];
                if (!table) {
                    this.target.bind(event, this.trigger.bind(this));
                    this.reset(event);
                    table = this.events[event];
                }
                _accessor.call(this, table, selector, 
                    handler, _add_handler);
            }
            return this;
        },

        off: function(event, selector, handler){
            if (isFunction(selector)) {
                handler = selector;
                selector = undefined;
            }
            var table = this.events[event];
            if (table) {
                _accessor.call(this, table, selector,
                    handler, _remove_handler);
            }
            return this;
        },

        matches: function(event, selector){
            var table = this.events[event];
            return _accessor.call(this, table, selector,
                null, _get_handler);
        },

        reset: function(event){
            if (event) {
                this.events[event] = this.matchesSelector ? {}
                    : { '.': {}, '#': {}, '&': {} };
                _set_lock.call(this, event);
            } else {
                this.events = {};
                this.locks = {};
            }
            return this;
        },

        disable: function(event, selector){
            var locks = this.locks;
            if (event) {
                var lock = locks[event];
                if (!lock) {
                    lock = _set_lock.call(this, event);
                }
                if (selector) {
                    _accessor.call(this, lock, selector, 
                        true, _add_handler, true);
                } else {
                    lock._disable = true;
                }
            } else {
                this._global_lock = true;
            }
            return this;
        },

        enable: function(event, selector){
            var locks = this.locks;
            if (event) {
                var lock = locks[event];
                if (lock) {
                    if (selector) {
                        _accessor.call(this, lock, selector, 
                            null, _remove_handler, true);
                    } else {
                        delete lock._disable;
                    }
                }
            } else {
                delete this._global_lock;
            }
            return this;
        },

        trigger: function(e){
            var self = this,
                result,
                t = e.target, 
                locks = this.locks[e.type] || {},
                table = this.events[e.type];
            if (!table || this._global_lock || locks._disable) {
                return result;
            }
            if (this.matchesSelector) {
                Object.keys(table).forEach(function(selector){
                    if (!locks[selector] && _matches_selector(this, selector)) {
                        result = _run_handler.call(self, 
                            table[selector], this, e);
                    }
                }, t);
            } else {
                var pre, expr;
                var handler = (pre = '#') && (expr = t.id) && table[pre][expr] 
                    || (pre = '.') && (expr = t.className) && table[pre][expr] 
                    || (pre = '&') && (expr = t.nodeName.toLowerCase()) 
                        && table[pre][expr] 
                    || null;
                if (handler) {
                    var lock = locks[pre][expr];
                    if (!lock) {
                        result = _run_handler.call(this, handler, t, e);
                    }
                }
            }
            if (table._self_) {
                result = _run_handler.call(this, table._self_, t, e);
            }
            return result;
        }
    
    };

    function _run_handler(handler, t, e){
        var result;
        if (handler) {
            if (this.trace) {
                this.traceStack.unshift('<' + t.nodeName 
                    + '#' + (t.id || '') + '>.' 
                    + (t.className || '').split(/\s+/).join('.'));
                if (this.traceStack.length > this.trace) {
                    this.traceStack.pop();
                }
            }
            result = handler.call(t, e);
            if (this.preventDefault && !result) { 
                e.preventDefault();
            }
        }
        return result;
    }

    function _add_handler(lib, key, handler, override){
        var old = lib[key];
        if (override) {
            lib[key] = handler;
        } else if (handler) {
            if (!old) {
                old = lib[key] = fnQueue();
            }
            old.push(handler);
        }
    }

    function _remove_handler(lib, key, handler, override){
        var old = lib[key];
        if (!handler || override) {
            delete lib[key];
        } else if (old) {
            old.clear(handler);
        }
    }

    function _get_handler(lib, key){
        return lib[key];
    }

    function _set_lock(event){
        return this.locks[event] = this.matchesSelector ? {}
            : { '.': {}, '#': {}, '&': {} };
    }

    function _accessor(table, selector, handler, fn, override){
        if (override === undefined) {
            override = this.autoOverride;
        }
        if (!selector) {
            selector = '_self_';
        } else if (!this.matchesSelector) {
            var prefix = (/^[\.#]/.exec(selector) || ['&'])[0];
            selector = selector.substr(prefix !== '&' ? 1 : 0);
            table = table[prefix];
            if ('.' === prefix) {
                selector = selector.split('.').join(' ');
            }
        }
        return fn(table, selector, handler, override);
    }

    var exports = function(elm, opt){
        return new exports.Soviet(elm, opt);
    };

    exports.Soviet = Soviet;

    return exports;

});

/* @source ../pachislot/app.js */;


define("../pachislot/app", [
  "mo/lang",
  "dollar",
  "mo/template",
  "soviet",
  "choreo",
  "db",
  "../pachislot/horserace",
  "../pachislot/tpl/main",
  "../pachislot/tpl/wel",
  "../pachislot/tpl/new",
  "../pachislot/tpl/save",
  "../pachislot/tpl/load",
  "../pachislot/tpl/export"
], function(_, $, tpl, soviet, choreo, db, horserace,
    tpl_main, tpl_wel, tpl_new, tpl_save, tpl_load, tpl_export){

    var TPL_MAIN_VIEW = tpl_main.template,
        TPL_WEL_VIEW = tpl_wel.template,
        TPL_NEW_VIEW = tpl_new.template,
        TPL_LOAD_VIEW = tpl_load.template,
        TPL_EXPORT_VIEW = tpl_export.template,
        TPL_SAVE_VIEW = tpl_save.template;

    var uievents = {

        '.controller .start': function(){
            app.start();
        },

        '.controller .stop': function(){
            app.stop();
        },

        '.controller .new': function(){
            app.showNewView();
        },

        '.controller .save': function(){
            if (app.saveGame()) {
                app.showSaveView();
            }
        },

        '.controller .load': function(){
            app.showLoadView();
        },

        '.controller .export': function(){
            app.showExportView();
        },

        '.controller .reset': function(){
            if (confirm('清空所有获奖记录和抽奖设置，恢复原始数据？')) {
                app.resetData();
            }
        },

        '.load-item': function(){
            var n = this.href.replace(/.*#/, '');
            app.loadGame(n);
            app.showMainView();
        },

        '.view input.cancel': function(){
            app.showWelcome();
        },
        
        '.new-form input[type="submit"]': function(){
            var form = $(this).closest('form')[0];
            if (!form.title.value) {
                return alert('需要标题！');
            }
            app.createGame(form.title.value, form.num.value);
            app.showMainView();
        }

    };

    var app = {

        init: function(opt){
            this._data = this._originData = opt.data;
            this._dataPicUrl = opt.dataPicUrl;
            this.observer = opt.observer;
            var node = this._node = $(opt.node);
            this._screen = node.find('article');
            this._lamp = node.find('.lamp');
            this.horserace = horserace({
                frame: this._lamp[0],
                inner: this._screen[0]
            });
            $(window).bind('resize', function(){
                app.horserace.reset();
            });

            this.restore();

            this.showWelcome();

            soviet(document, {
                preventDefault: true,
                matchesSelector: true
            }).on('click', uievents);
        },

        updateView: function(view){
            if (this._currentView) {
                this._currentView.removeClass('active');
            }
            this._currentView = view;
            this._currentView.addClass('active');
            this.pause();
            this.horserace.stop();
        },

        updateRoller: function(){
            if (this._mainView) {
                this._mainView.remove();
            }
            var d = 5 - this._currentGame.col,
                empyt_col = d > 0 ? Math.ceil(d/2) : 0;
            this._mainView = $(tpl.convertTpl(TPL_MAIN_VIEW, {
                data: this._data.sort(function(){
                    return Math.random() - 0.5;
                }),
                dataPicUrl: this._dataPicUrl,
                width: Math.ceil(this._screen.width() / (empyt_col*2 + parseFloat(this._currentGame.col))),
                height: this._screen.height(),
                num: Math.ceil(this._data.length / this._currentGame.col),
                emptyCol: empyt_col,
                col: this._currentGame.col
            })).appendTo(this._screen);
            this.updateView(this._mainView);
        },

        showWelcome: function(){
            if (!this._welView) {
                this._welView = $(tpl.convertTpl(TPL_WEL_VIEW, {}))
                    .appendTo(this._screen);
            }
            this.updateView(this._welView);
            this.horserace.welcome();
        },

        showMainView: function(){
            this.updateRoller();
        },

        showNewView: function(){
            if (!this._newView) {
                this._newView = $(tpl.convertTpl(TPL_NEW_VIEW, {}))
                    .appendTo(this._screen);
            }
            this.updateView(this._newView);
        },

        showSaveView: function(){
            if (this._saveView) {
                this._saveView.remove();
            }
            var games = JSON.parse(localStorage.getItem('pachi-games')) || [];
            this._saveView = $(tpl.convertTpl(TPL_SAVE_VIEW, {
                records: games
            })).appendTo(this._screen);
            this.updateView(this._saveView);
        },

        showLoadView: function(){
            if (this._loadView) {
                this._loadView.remove();
            }
            var games = JSON.parse(localStorage.getItem('pachi-games')) || [];
            this._loadView = $(tpl.convertTpl(TPL_LOAD_VIEW, {
                records: games
            })).appendTo(this._screen);
            this.updateView(this._loadView);
        },

        showExportView: function(){
            if (this._exportView) {
                this._exportView.remove();
            }
            var games = JSON.parse(localStorage.getItem('pachi-games')) || [];
            this._exportView = $(tpl.convertTpl(TPL_EXPORT_VIEW, {
                records: games
            })).appendTo(this._screen);
            this.updateView(this._exportView);
        },

        resetData: function(){
            localStorage.removeItem('pachi-games');
            this._data = this._originData;
            this.restore();
            this.showWelcome();
        },
        
        restore: function(){
            this._games = JSON.parse(localStorage.getItem('pachi-games')) || [];
            var results = [];
            this._games.forEach(function(game){
                if (game.results) {
                    results.push.apply(results, game.results);
                }
            });
            var lib = _.index(results, '0');
            app._data = app._data.filter(function(item){
                return !this[item[0]];
            }, lib);
        },

        createGame: function(title, col){
            this._currentGame = {
                title: title, 
                col: col
            };
            this._games.unshift(this._currentGame);
        },

        saveGame: function(){
            if (this._currentGame) {
                localStorage.setItem('pachi-games', JSON.stringify(this._games));
                return true;
            } else {
                alert('先创建或加载！');
            }
        },

        loadGame: function(n){
            this._currentGame = this._games.splice(n, 1)[0];
            this._games.unshift(this._currentGame);
            this.saveGame();
        },

        start: function(){
            if (this._running) {
                return;
            }
            if (!this._currentGame) {
                return alert('先创建或加载！');
            }
            if (this._currentGame.results) {
                if (confirm('废弃之前的结果，重新抽取？')) {
                    this._data.push.apply(this._data, this._currentGame.results);
                    this._currentGame.results = null;
                    this.updateRoller();
                } else {
                    return;
                }
            }
            if (this._currentView !== this._mainView) {
                this.showMainView();
            }
            var results = [],
                slots = this._mainView.find('.slot');
            this._running = true;
            this.horserace.waiting();
            slots.forEach(function(slot, i){
                var count = 0,
                    cards = $('li', slot),
                    total = cards.length,
                    unit = cards.height(),
                    stage = choreo(),
                    action = stage.actor(slot, {
                        transform: 'translateY(-' + unit + 'px)'
                    }, 100 + Math.floor(Math.random() * 50), 'linear');
                stage.play().follow().done(function(){
                    if (++count >= total - 1) {
                        action.setto('translateY(0px)');
                        stage.play().complete();
                        count = -1;
                    } else {
                        if (!app._running) {
                            var result = cards.eq(count).find('a');
                            results.push([
                                result.attr('href').replace(/.*#/, ''),
                                result.find('img').attr('src').replace(/.*\//, ''),
                                result.find('strong').text()
                            ]);
                            if (results.length === slots.length) {
                                app.observer.fire('result', [results]);
                            }
                            return;
                        }
                        action.extendto('translateY(-' + unit + 'px)');
                        stage.play();
                    }
                    stage.follow().done(arguments.callee);
                });
            });
        },

        pause: function(){
            this._running = false;
        },

        stop: function(){
            if (!this._currentGame || this._currentGame.results) {
                return;
            }
            this._running = false;
            this.observer.once('result', function(results){
                var lib = _.index(results, '0');
                app._data = app._data.filter(function(item){
                    return !this[item[0]];
                }, lib);
                app._currentGame.results = results;
                app.saveGame();
                app.horserace.greeting();
            });
        }

    };

    return app;

});

/* @source mo/easing.js */;

/**
 * An easing library supports jquery.js, standalone module and CSS timing functions
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/easing", [], function(require, exports){

    var def = 'easeOutQuad';

    var timing_values = {
        //easeInQuad: 'cubic-bezier(0.550, 0.085, 0.680, 0.530)',
        //easeOutQuad: 'cubic-bezier(0.250, 0.460, 0.450, 0.940)',
        //easeInOutQuad: 'cubic-bezier(0.455, 0.030, 0.515, 0.955)',
        easeInCubic: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)',
        easeOutCubic: 'cubic-bezier(0.215, 0.610, 0.355, 1.000)',
        easeInOutCubic: 'cubic-bezier(0.645, 0.045, 0.355, 1.000)',
        easeInQuart: 'cubic-bezier(0.895, 0.030, 0.685, 0.220)',
        easeOutQuart: 'cubic-bezier(0.165, 0.840, 0.440, 1.000)',
        easeInOutQuart: 'cubic-bezier(0.770, 0.000, 0.175, 1.000)',
        easeInQuint: 'cubic-bezier(0.755, 0.050, 0.855, 0.060)',
        easeOutQuint: 'cubic-bezier(0.230, 1.000, 0.320, 1.000)',
        easeInOutQuint: 'cubic-bezier(0.860, 0.000, 0.070, 1.000)',
        easeInSine: 'cubic-bezier(0.470, 0.000, 0.745, 0.715)',
        easeOutSine: 'cubic-bezier(0.390, 0.575, 0.565, 1.000)',
        easeInOutSine: 'cubic-bezier(0.445, 0.050, 0.550, 0.950)',
        easeInExpo: 'cubic-bezier(0.950, 0.050, 0.795, 0.035)',
        easeOutExpo: 'cubic-bezier(0.190, 1.000, 0.220, 1.000)',
        easeInOutExpo: 'cubic-bezier(1.000, 0.000, 0.000, 1.000)',
        easeInCirc: 'cubic-bezier(0.600, 0.040, 0.980, 0.335)',
        easeOutCirc: 'cubic-bezier(0.075, 0.820, 0.165, 1.000)',
        easeInOutCirc: 'cubic-bezier(0.785, 0.135, 0.150, 0.860)',
        easeInBack: 'cubic-bezier(0.600, -0.280, 0.735, 0.045)',
        easeOutBack: 'cubic-bezier(0.175, 0.885, 0.320, 1.275)',
        easeInOutBack: 'cubic-bezier(0.680, -0.550, 0.265, 1.550)',
        easeInElastic: '',
        easeOutElastic: '',
        easeInOutElastic: '',
        easeInBounce: '',
        easeOutBounce: '',
        easeInOutBounce: ''
    };

    /**
     * jQuery Easing v1.3 - http://gsgd.co.uk/sandbox/jquery/easing/
     * t: current time, b: begInnIng value, c: change In value, d: duration
     */
    var timing_functions = {
        linear: function(x, t, b, c) {
            return b + c * x;
        },
        jswing: function(x, t, b, c) {
            return ((-Math.cos(x*Math.PI)/2) + 0.5) * c + b;
        },
        swing: function (x, t, b, c, d) {
            return timing_functions[def](x, t, b, c, d);
        },
        easeInQuad: function (x, t, b, c, d) {
            return c*(t/=d)*t + b;
        },
        easeOutQuad: function (x, t, b, c, d) {
            return -c *(t/=d)*(t-2) + b;
        },
        easeInOutQuad: function (x, t, b, c, d) {
            if ((t/=d/2) < 1) return c/2*t*t + b;
            return -c/2 * ((--t)*(t-2) - 1) + b;
        },
        easeInCubic: function (x, t, b, c, d) {
            return c*(t/=d)*t*t + b;
        },
        easeOutCubic: function (x, t, b, c, d) {
            return c*((t=t/d-1)*t*t + 1) + b;
        },
        easeInOutCubic: function (x, t, b, c, d) {
            if ((t/=d/2) < 1) return c/2*t*t*t + b;
            return c/2*((t-=2)*t*t + 2) + b;
        },
        easeInQuart: function (x, t, b, c, d) {
            return c*(t/=d)*t*t*t + b;
        },
        easeOutQuart: function (x, t, b, c, d) {
            return -c * ((t=t/d-1)*t*t*t - 1) + b;
        },
        easeInOutQuart: function (x, t, b, c, d) {
            if ((t/=d/2) < 1) return c/2*t*t*t*t + b;
            return -c/2 * ((t-=2)*t*t*t - 2) + b;
        },
        easeInQuint: function (x, t, b, c, d) {
            return c*(t/=d)*t*t*t*t + b;
        },
        easeOutQuint: function (x, t, b, c, d) {
            return c*((t=t/d-1)*t*t*t*t + 1) + b;
        },
        easeInOutQuint: function (x, t, b, c, d) {
            if ((t/=d/2) < 1) return c/2*t*t*t*t*t + b;
            return c/2*((t-=2)*t*t*t*t + 2) + b;
        },
        easeInSine: function (x, t, b, c, d) {
            return -c * Math.cos(t/d * (Math.PI/2)) + c + b;
        },
        easeOutSine: function (x, t, b, c, d) {
            return c * Math.sin(t/d * (Math.PI/2)) + b;
        },
        easeInOutSine: function (x, t, b, c, d) {
            return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
        },
        easeInExpo: function (x, t, b, c, d) {
            return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
        },
        easeOutExpo: function (x, t, b, c, d) {
            return (t==d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
        },
        easeInOutExpo: function (x, t, b, c, d) {
            if (t==0) return b;
            if (t==d) return b+c;
            if ((t/=d/2) < 1) return c/2 * Math.pow(2, 10 * (t - 1)) + b;
            return c/2 * (-Math.pow(2, -10 * --t) + 2) + b;
        },
        easeInCirc: function (x, t, b, c, d) {
            return -c * (Math.sqrt(1 - (t/=d)*t) - 1) + b;
        },
        easeOutCirc: function (x, t, b, c, d) {
            return c * Math.sqrt(1 - (t=t/d-1)*t) + b;
        },
        easeInOutCirc: function (x, t, b, c, d) {
            if ((t/=d/2) < 1) return -c/2 * (Math.sqrt(1 - t*t) - 1) + b;
            return c/2 * (Math.sqrt(1 - (t-=2)*t) + 1) + b;
        },
        easeInElastic: function (x, t, b, c, d) {
            var s=1.70158;var p=0;var a=c;
            if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
            if (a < Math.abs(c)) { a=c; var s=p/4; }
            else var s = p/(2*Math.PI) * Math.asin (c/a);
            return -(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
        },
        easeOutElastic: function (x, t, b, c, d) {
            var s=1.70158;var p=0;var a=c;
            if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
            if (a < Math.abs(c)) { a=c; var s=p/4; }
            else var s = p/(2*Math.PI) * Math.asin (c/a);
            return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
        },
        easeInOutElastic: function (x, t, b, c, d) {
            var s=1.70158;var p=0;var a=c;
            if (t==0) return b;  if ((t/=d/2)==2) return b+c;  if (!p) p=d*(.3*1.5);
            if (a < Math.abs(c)) { a=c; var s=p/4; }
            else var s = p/(2*Math.PI) * Math.asin (c/a);
            if (t < 1) return -.5*(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
            return a*Math.pow(2,-10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )*.5 + c + b;
        },
        easeInBack: function (x, t, b, c, d, s) {
            if (s == undefined) s = 1.70158;
            return c*(t/=d)*t*((s+1)*t - s) + b;
        },
        easeOutBack: function (x, t, b, c, d, s) {
            if (s == undefined) s = 1.70158;
            return c*((t=t/d-1)*t*((s+1)*t + s) + 1) + b;
        },
        easeInOutBack: function (x, t, b, c, d, s) {
            if (s == undefined) s = 1.70158; 
            if ((t/=d/2) < 1) return c/2*(t*t*(((s*=(1.525))+1)*t - s)) + b;
            return c/2*((t-=2)*t*(((s*=(1.525))+1)*t + s) + 2) + b;
        },
        easeInBounce: function (x, t, b, c, d) {
            return c - timing_functions.easeOutBounce (x, d-t, 0, c, d) + b;
        },
        easeOutBounce: function (x, t, b, c, d) {
            if ((t/=d) < (1/2.75)) {
                return c*(7.5625*t*t) + b;
            } else if (t < (2/2.75)) {
                return c*(7.5625*(t-=(1.5/2.75))*t + .75) + b;
            } else if (t < (2.5/2.75)) {
                return c*(7.5625*(t-=(2.25/2.75))*t + .9375) + b;
            } else {
                return c*(7.5625*(t-=(2.625/2.75))*t + .984375) + b;
            }
        },
        easeInOutBounce: function (x, t, b, c, d) {
            if (t < d/2) return timing_functions.easeInBounce (x, t*2, 0, c, d) * .5 + b;
            return timing_functions.easeOutBounce (x, t*2-d, 0, c, d) * .5 + c*.5 + b;
        }
    };

    timing_values.easeIn = timing_values.easeInQuad = 'ease-in';
    timing_values.easeOut = timing_values.easeOutQuad = 'ease-out';
    timing_values.easeInOut = timing_values.easeInOutQuad = 'ease-in-out';

    timing_functions.easeIn = timing_functions.easeInQuad;
    timing_functions.easeOut = timing_functions.easeOutQuad;
    timing_functions.easeInOut = timing_functions.easeInOutQuad;

    exports.def = def;
    exports.values = timing_values;
    exports.functions = timing_functions;

});

/* @source mo/key.js */;

/**
 * Wrapping API for keyboard events
 * Support key sequence, multiple key press, ...
 *
 * using AMD (Asynchronous Module Definition) API with OzJS
 * see http://ozjs.org for details
 *
 * Copyright (C) 2010-2012, Dexter.Yy, MIT License
 * vim: et:ts=4:sw=4:sts=4
 */
define("mo/key", [
  "jquery",
  "mo/lang"
], function($, _){

    var specialKeys = {
            8: "backspace", 9: "tab", 13: "return", 16: "shift", 17: "ctrl", 18: "alt", 19: "pause",
            20: "capslock", 27: "esc", 32: "space", 33: "pageup", 34: "pagedown", 35: "end", 36: "home",
            37: "left", 38: "up", 39: "right", 40: "down", 45: "insert", 46: "del", 
            96: "0", 97: "1", 98: "2", 99: "3", 100: "4", 101: "5", 102: "6", 103: "7",
            104: "8", 105: "9", 106: "*", 107: "+", 109: "-", 110: ".", 111 : "/", 
            112: "f1", 113: "f2", 114: "f3", 115: "f4", 116: "f5", 117: "f6", 118: "f7", 119: "f8", 
            120: "f9", 121: "f10", 122: "f11", 123: "f12", 144: "numlock", 145: "scroll", 191: "/", 224: "meta"
        },
    
        shiftNums = {
            "`": "~", "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", 
            "8": "*", "9": "(", "0": ")", "-": "_", "=": "+", ";": ":", "'": "\"", ",": "<", 
            ".": ">",  "/": "?",  "\\": "|"
        };

    function Keys(opt){
        opt = opt || {};
        var self = this;
        this.target = opt.target || document;
        this.keyHandlers = {};
        this.globalKeyHandlers = {};
        this.rules = [];
        this.sequence = {};
        this.sequenceNums = [];
        this.history = [];
        this.trace = opt.trace;
        this.traceStack = opt.traceStack || [];
        this.forTextarea = opt.forTextarea || false;
        this._handler = function(ev){
            if (self.forTextarea && (!/textarea|input/i.test(ev.target.nodeName) && ev.target.type !== 'text')) {
                return;
            }
            if ( !self.forTextarea && this !== ev.target && (/textarea|select/i.test(ev.target.nodeName) 
                    || ev.target.type === "text") ) {
                return;
            }

            var result, 
                is_disabled = self.lock || !self.check(this, ev),
                handlers = self.keyHandlers[ev.type],
                globalHandler = self.globalKeyHandlers[ev.type];

            if (handlers) {
                var possible = getKeys(ev),
                    handler,
                    queue_handler;

                for (var i in possible) {
                    handler = handlers[i];
                    if (handler) {
                        break;
                    }
                }

                if (self.sequenceNums.length && !is_disabled) {
                    var history = self.history;
                    history.push(i);
                    if (history.length > 10) {
                        history.shift();
                    }

                    if (history.length > 1) {
                        for (var j = self.sequenceNums.length - 1; j >= 0; j--) {
                            queue_handler = handlers[history.slice(0 - self.sequenceNums[j]).join("->")];
                            if (queue_handler) {
                                if (self.trace) {
                                    self._trace(j);
                                }
                                result = queue_handler.apply(this, arguments);
                                history.length = 0;
                                if (!result) {
                                    ev.preventDefault();
                                }
                                return result;
                            }
                        }
                    }
                }

                if (handler) {
                    if (is_disabled) {
                        return false;
                    }
                    if (self.trace) {
                        self._trace(i);
                    }
                    result = handler.apply(this, arguments);
                    if (!result) {
                        ev.preventDefault();
                    }
                }
            }

            if (globalHandler) {
                if (is_disabled) {
                    return false;
                }
                result = globalHandler.apply(this, arguments);
                if (!result) {
                    ev.preventDefault();
                }
            }

            return result;

        };
    }

    Keys.prototype = {

        addHandler: function(event, keyname, fn){
            var self = this,
                handlers = this.keyHandlers[event];
            if (!fn) {
                fn = keyname;
                keyname = '';
            }

            function add(kname){
                if (kname) {
                    var order = kname.split('->');
                    if (order.length > 1) {
                        self.sequence[order.length] = 1;
                        var seq = [];
                        for (var i in self.sequence) {
                            seq.push(parseInt(i, 10));
                        }
                        self.sequenceNums = seq.sort(function(a,b){ return a - b; });
                    }
                    var possible = kname.toLowerCase();
                    if (!handlers[possible]) {
                        handlers[possible] = _.fnQueue();
                    }
                    handlers[possible].push(fn);
                } else {
                    var globalHandlers = self.globalKeyHandlers[event];
                    if (!globalHandlers) {
                        globalHandlers = self.globalKeyHandlers[event] = _.fnQueue();
                    }
                    globalHandlers.push(fn);
                }
            }

            if (!handlers) {
                handlers = this.keyHandlers[event] = {};
                $(this.target).bind(event, this._handler);
            }
            if (Array.isArray(keyname)) {
                keyname.forEach(function(n){
                    add(n);
                });
            } else {
                add(keyname);
            }
            return this;
        },

        _trace: function(key){
            this.traceStack.unshift('[' + key + ']');
            if (this.traceStack.length > this.trace) {
                this.traceStack.pop();
            }
        },

        reset: function(){
            for (var event in this.keyHandlers) {
                $(this.target).unbind(event, this._handler);
            }
            this.keyHandlers = {};
            this.rules = [];
            this.history = [];
            delete this._handler;
            this.lock = false;
        },

        addRule: function(fn){
            this.rules.push(fn);
            return this;
        },

        enable: function(){
            this.lock = false;
        },

        disable: function(){
            this.lock = true;
        },

        check: function(target, ev){
            var re = true,
                r = this.rules;
            for (var i = 0, l = r.length; i < l; i++) {
                if (!r[i].call(target, ev)) {
                    re = false;
                    break;
                }
            }
            return re;
        }

    };

    (["down", "up", "press" ]).forEach(function(name){
        this[name] = function(keyname, fn){
            this.addHandler("key" + name, keyname, fn);
            return this;
        };
    }, Keys.prototype);


    function getKeys(event){
        // Keypress represents characters, not special keys
        var special = event.type !== "keypress" && specialKeys[ event.which ],
            character = String.fromCharCode( event.which ).toLowerCase(),
            key, modif = "", possible = {};

        // check combinations (alt|ctrl|shift+anything)
        if ( event.altKey && special !== "alt" ) {
            modif += "alt+";
        }

        if ( event.ctrlKey && special !== "ctrl" ) {
            modif += "ctrl+";
        }
        
        // TODO: Need to make sure this works consistently across platforms
        if ( event.metaKey && !event.ctrlKey && special !== "meta" ) {
            modif += "meta+";
        }

        if ( event.shiftKey && special !== "shift" ) {
            modif += "shift+";
        }

        if ( special ) {
            possible[ modif + special ] = true;
        } else {
            var k = modif + character;
            if (k) {
                possible[k] = true;
            }
            k = shiftNums[ character ];
            if (k) {
                possible[modif + k] = true;

                // "$" can be triggered as "Shift+4" or "Shift+$" or just "$"
                if ( modif === "shift+" ) {
                    k = shiftNums[ character ];
                    if (k) {
                        possible[k] = true;
                    }
                }
            }
        }

        return possible;
    }

    function KeysFactory(opt){
        return new Keys(opt);
    }

    KeysFactory.KEYS_CODE = specialKeys;

    return KeysFactory;

});



/* @source  */;


require.config({
    baseUrl: 'js/mod/',
    aliases: {
        data: '../data/',
        pachislot: '../pachislot/'
    }
});

define('jquery', ['dollar'], function($){
    return $;
});

require([
    'mo/lang',
    'dollar',
    'mo/key',
    'mo/easing',
    'choreo',
    'eventmaster',
    'pachislot/app',
    'data/2012',
    'mo/domready'
], function(_, $, key, easingLib, choreo, event, app, data){

    choreo.config({
        easing: easingLib
    });

    var observer = event();

    app.init({
        node: $('.machine'),
        data: data,
        dataPicUrl: 'pics/data/2012/',
        observer: observer
    });

    key().up(['space'], function(){

    });

});
