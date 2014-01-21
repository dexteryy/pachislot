
<div class="view main-view unopened" style="width:{%= width * (col + emptyCol*2) %}px;">
    <div class="roller">

        {% for (var i = 0; i < emptyCol; i++) { %}
        <ul class="empty-slot" style="width:{%= width - 10 %}px;"></ul>
        {% } %}

        <ul class="slot" style="width:{%= width - 10 %}px;">
        {% data.forEach(function(item, i){ %}

            {% if (i % num === 0) { %}

                {% if (i !== 0) { %}
                </ul><ul class="slot" style="width:{%= width - 10 %}px;">
                {% } %}

                {% var last = data[i + num - 1]; if (!last) { last = data[data.length - 1]; } %}
                <li><a href="#{%= last[0] %}" style="height:{%= height %}px;background-image:url({%= dataPicUrl %}{%= last[1] %})">
                    <span><span></span><strong>{%= last[2] %}</strong></span>
                    <em></em>
                </a></li>

            {% } %}

            <li><a href="#{%= item[0] %}" style="height:{%= height %}px;background-image:url({%= dataPicUrl %}{%= item[1] %})">
                <span><span></span><strong>{%= item[2] %}</strong></span>
                <em></em>
            </a></li>

        {% }); %}
        </ul>

        {% for (var i = 0; i < emptyCol; i++) { %}
        <ul class="empty-slot" style="width:{%= width - 10 %}px;"></ul>
        {% } %}

    </div>
</div>
