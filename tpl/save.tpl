
<form class="view save-view">
    <fieldset>
        <legend>保存成功！</legend>
        <ul class="select">
            {% records.forEach(function(game){ %}
            <li><span>{%= game.title %}</span></li>
            {% }); %}
        </ul>
    </fieldset>
    <p class="btns">
        <input type="button" value="返回" class="cancel">
    </p>
</form>

