
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
    'data/sample',
    'mo/domready'
], function(_, $, key, easingLib, choreo, event, app, data_sample){

    choreo.config({
        easing: easingLib
    });

    var observer = event();

    app.init({
        node: $('.machine'),
        data: data_sample,
        dataPicUrl: 'pics/data/sample/',
        observer: observer
    });

    key().up(['space'], function(){

    });

});
