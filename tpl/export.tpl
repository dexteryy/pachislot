
<div class="view export-view">
    <h3>导出全部结果</h3>
    <fieldset>
        {% records.forEach(function(game){ %}
            <h6>{%= game.title %}</h6>
            <p>人数：{%= game.col %}</p>
            {% (game.results || []).forEach(function(item){ %}
            <p>
                <strong>{%= (item[0]) %} - </strong>
                <span>{%= (item[2]) %}</span>
            </p>
            {% }); %}
        {% }); %}
    </fieldset>
    <p class="btns">
        <input type="button" value="返回" class="cancel">
    </p>
</div>



