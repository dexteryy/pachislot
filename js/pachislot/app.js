
define([
    'mo/lang',
    'dollar',
    'mo/template',
    'soviet',
    'choreo',
    'db',
    './horserace',
    './tpl/main',
    './tpl/wel',
    './tpl/new',
    './tpl/save',
    './tpl/load'
], function(_, $, tpl, soviet, choreo, db, horserace,
    tpl_main, tpl_wel, tpl_new, tpl_save, tpl_load){

    var TPL_MAIN_VIEW = tpl_main.template,
        TPL_WEL_VIEW = tpl_wel.template,
        TPL_NEW_VIEW = tpl_new.template,
        TPL_LOAD_VIEW = tpl_load.template,
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
                    stop_count = 1,
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
                        if (!app._running && --stop_count <= 0) {
                            var result = cards.eq(count).find('a');
                            results.push([
                                result.attr('href').replace(/.*#/, ''),
                                result.find('strong').text(),
                                result.find('img').attr('src').replace(/.*\//, '')
                            ]);
                            if (results.length === slots.length - 1) {
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
