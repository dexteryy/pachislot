define([], function(){

    return {"template":"\n<div class=\"{%= side %}\">\n    {% for (var i = 0; i < num; i++) { %}\n    <div class=\"led\"></div>\n    {% } %}\n</div>\n"}; 

});