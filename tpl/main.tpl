
<div class="view main-view" style="width:{%= width * col %}px;">
    <div class="roller">
        <ul class="slot" style="width:{%= width - 10 %}px;">
        {% data.forEach(function(item, i){ %}
            <li><a href="#{%= item[0] %}" style="height:{%= height %}px;">
                <strong>{%= item[1] %}</strong>
                <img src="{%= dataPicUrl %}{%= item[2] %}">
            </a></li>
            {% if ((i + 1) % Math.ceil(data.length / col) === 0) { %}
                {% var j = i - Math.ceil(data.length / col) + 1; %}
                <li><a href="#{%= data[j][0] %}" style="height:{%= height %}px;">
                    <strong>{%= data[j][1] %}</strong>
                    <img src="{%= dataPicUrl %}{%= data[j][2] %}">
                </a></li>
                </ul><ul class="slot" style="width:{%= width - 10 %}px;">
            {% } %}
        {% }); %}
            {% var j = data.length - data.length % Math.ceil(data.length / col); if (j === data.length) { j = data.length - 1; } %}
            <li><a href="#{%= data[j][0] %}" style="height:{%= height %}px;">
                <strong>{%= data[j][1] %}</strong>
                <img src="{%= dataPicUrl %}{%= data[j][2] %}">
            </a></li>
        </ul>
    </div>
</div>
