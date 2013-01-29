define([], function(){

    return {"template":"\n<form class=\"view new-form\">\n    <fieldset>\n        <legend>创建新抽奖</legend>\n        <p>\n            <label>名称</label>\n            <input type=\"text\" name=\"title\" required placeholder=\"比如：二等奖 - 第三批\">\n        </p>\n        <p>\n            <label>名额</label>\n            <input type=\"number\" name=\"num\" min=\"1\" max=\"10\" step=\"1\" value=\"3\">\n        </p>\n    </fieldset>\n    <p class=\"btns\">\n        <input type=\"submit\" value=\"确定\">\n        <input type=\"button\" value=\"取消\" class=\"cancel\">\n    </p>\n</form>\n"}; 

});