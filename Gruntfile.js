
module.exports = function(grunt) {

    grunt.initConfig({
        //istatic: {
            //main: {
                //repos: {
                    //'necolas/normalize.css': {
                        //file: {
                            //'normalize.css': 'css/'
                        //}
                    //},
                    //'dexteryy/OzJS': {
                        //file: {
                            //'oz.js': 'js/lib/'
                        //}
                    //},
                    //'dexteryy/mo': {
                        //file: {
                            //'': 'js/mod/mo/'
                        //}
                    //},
                    //'dexteryy/DollarJS': {
                        //file: {
                            //'dollar.js': 'js/mod/'
                        //}
                    //},
                    //'dexteryy/EventMaster': {
                        //file: {
                            //'eventmaster.js': 'js/mod/'
                        //}
                    //},
                    //'dexteryy/SovietJS': {
                        //file: {
                            //'soviet.js': 'js/mod/'
                        //}
                    //},
                    //'dexteryy/ChoreoJS': {
                        //file: {
                            //'choreo.js': 'js/mod/'
                        //}
                    //}
                //}
            //}
        //},
        furnace: {
            tpl: {
                options: {
                    importas: 'tpl',
                    exportas: 'amd'
                },
                files: [{
                    expand: true,
                    cwd: 'tpl/',
                    src: ['**/*.tpl'],
                    dest: 'js/pachislot/tpl/',
                    ext: '.js'
                }]
            }
        },
        ozma: {
            main: {
                src: 'js/main.js',
                config: {
                    baseUrl: "js/mod/",
                    distUrl: "dist/js/mod/",
                    loader: "../lib/oz.js",
                    disableAutoSuffix: true
                }
            }
        },
        compass: {
            main: {
                options: {
                    config: 'css/config.rb',
                    sassDir: 'css',
                    cssDir: 'dist/css',
                    imagesDir: 'pics',
                    relativeAssets: true,
                    outputStyle: 'expanded',
                    noLineComments: false,
                    require: [
                    ],
                    environment: 'production'
                }
            }
        },
        watch: {
            css: {
                files: ['css/**/*.scss'],
                tasks: ['compass']
            }, 
            js: {
                files: ['js/**/*.js'],
                tasks: ['ozma']
            }, 
            tpl: {
                files: ['tpl/**/*.tpl'],
                tasks: ['furnace']
            }
        }
    });

    //grunt.loadNpmTasks('grunt-istatic');
    grunt.loadNpmTasks('grunt-ozjs');
    grunt.loadNpmTasks('grunt-furnace');
    grunt.loadNpmTasks('grunt-contrib-compass');
    grunt.loadNpmTasks('grunt-contrib-watch');
    
    grunt.registerTask('default', [
        'compass',
        'furnace',
        'ozma'
    ]);

};
