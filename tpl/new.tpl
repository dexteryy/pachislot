
<form class="view new-form">
    <fieldset>
        <legend>创建新抽奖</legend>
        <p>
            <label>名称</label>
            <input type="text" name="title" required placeholder="比如：二等奖 - 第三批">
        </p>
        <p>
            <label>名额</label>
            <input type="number" name="num" min="1" max="10" step="1" value="3">
        </p>
    </fieldset>
    <p class="btns">
        <input type="submit" value="确定">
        <input type="button" value="取消" class="cancel">
    </p>
</form>
