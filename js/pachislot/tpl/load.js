define([], function(){

    return {"template":"\n<form class=\"view save-view\">\n    <fieldset>\n        <legend>读取存档</legend>\n        <ul class=\"select\">\n            {% records.forEach(function(game, i){ %}\n            <li><a href=\"#{%= i %}\" class=\"load-item\">{%= game.title %}</a></li>\n            {% }); %}\n        </ul>\n    </fieldset>\n    <p class=\"btns\">\n        <input type=\"button\" value=\"返回\" class=\"cancel\">\n    </p>\n</form>\n\n\n"}; 

});