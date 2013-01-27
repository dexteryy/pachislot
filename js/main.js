
require.config({
    baseUrl: 'js/mod/',
    aliases: {
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
    'mo/domready'
], function(_, $, key, easingLib, choreo, event, app){

    choreo.config({
        easing: easingLib
    });

    var observer = event();

    app.init({
        observer: observer
    });

    key().up(['space'], function(){

    });

});
