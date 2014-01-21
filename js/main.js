
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
    'data/2014',
    'mo/domready'
], function(_, $, key, easingLib, choreo, event, app, data){

    choreo.config({
        easing: easingLib
    });

    var observer = event();

    app.init({
        node: $('.machine'),
        data: data,
        dataPicUrl: 'pics/data/2014/',
        observer: observer
    });

    key().up(['space'], function(){

    });

});
