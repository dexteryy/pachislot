# Doubanchou II: Pachislot / 豆瓣抽2：柏青嫂

一个仓促开发的web app，使用了现成的[OzJS模块](http://ozjs.org/)和项目模板，在正式使用的过程中发现居然蛮好用，没出任何bug！

跟[豆瓣抽1代](https://github.com/dexteryy/doubanchou)相比，将indexedDB简化成了localStorage，另外1代的主要用途已经转向DBA/DFA联赛选秀了，这个2代的设计更适合抽奖～

## 如何开发

1. 安装ruby依赖： 
    * `gem install animation --pre`
    * `gem install ceaser-easing`
    * `gem install animate-sass`
2. 安装node依赖：
    * `npm install`
        * grunt-contrib-compass在grunt 0.3.x下使用可能需要修改一个地方：将node_modules/grunt-contrib-compass/tasks/compass.js中的38行改为 `var options = this.data.options;`
3. 测试：
    * `grunt ozma`
    * `grunt compass`
    * `grunt watch`

