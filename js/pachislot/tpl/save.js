define([], function(){

    return {"template":"\n<form class=\"view save-view\">\n    <fieldset>\n        <legend>保存成功！</legend>\n        <ul class=\"select\">\n            {% records.forEach(function(game){ %}\n            <li><span>{%= game.title %}</span></li>\n            {% }); %}\n        </ul>\n    </fieldset>\n    <p class=\"btns\">\n        <input type=\"button\" value=\"返回\" class=\"cancel\">\n    </p>\n</form>\n\n"}; 

});