define([], function(){

    return {"template":"\n<div class=\"view export-view\">\n    <fieldset>\n        <legend>导出全部结果</legend>\n        {% records.forEach(function(game){ %}\n            <h6>{%= game.title %}</h6>\n            <p>人数：{%= game.cal %}</p>\n            {% (game.results || []).forEach(function(item){ %}\n            <p>\n                <strong>{%= (item[0]) %}</strong>\n                <span>{%= (item[2]) %}</span>\n            </p>\n            {% }); %}\n        {% }); %}\n    </fieldset>\n    <p class=\"btns\">\n        <input type=\"button\" value=\"返回\" class=\"cancel\">\n    </p>\n</div>\n\n\n\n"}; 

});