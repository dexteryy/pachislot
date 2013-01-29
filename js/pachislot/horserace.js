
define([
    'mo/lang',
    'dollar',
    'mo/template',
    './tpl/led'
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
