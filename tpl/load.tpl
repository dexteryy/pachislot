
<form class="view save-view">
    <fieldset>
        <legend>读取存档</legend>
        <ul class="select">
            {% records.forEach(function(game, i){ %}
            <li><a href="#{%= i %}" class="load-item">{%= game.title %}</a></li>
            {% }); %}
        </ul>
    </fieldset>
    <p class="btns">
        <input type="button" value="返回" class="cancel">
    </p>
</form>


