
module.exports = function(grunt) {

    grunt.initConfig({
        //pkg: '<json:package.json>',
        meta: {
        },
        istatic: {
            main: {
                repos: {
                    'necolas/normalize.css': {
                        file: {
                            'normalize.css': 'css/'
                        }
                    },
                    'dexteryy/OzJS': {
                        file: {
                            'oz.js': 'js/lib/'
                        }
                    },
                    'dexteryy/mo': {
                        file: {
                            '': 'js/mod/mo/'
                        }
                    },
                    'dexteryy/DollarJS': {
                        file: {
                            'dollar.js': 'js/mod/'
                        }
                    },
                    'dexteryy/EventMaster': {
                        file: {
                            'eventmaster.js': 'js/mod/'
                        }
                    },
                    'dexteryy/SovietJS': {
                        file: {
                            'soviet.js': 'js/mod/'
                        }
                    },
                    'dexteryy/ChoreoJS': {
                        file: {
                            'choreo.js': 'js/mod/'
                        }
                    }
                }
            }
        },
        oz: {
            main: {
                jstemplate: {
                    src: 'tpl/',
                    dest: 'js/pachislot/tpl/'
                }
            }
        },
        ozma: {
            main: {
                src: 'js/main.js',
                //saveConfig: true
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
                        'ceaser-easing',
                        'animation',
                        'animate-sass'
                    ],
                    environment: 'production'
                }
            }
        },
        watch: [{
            files: 'css/**/*.scss',
            tasks: 'compass'
        }, {
            files: 'js/**/*.js',
            tasks: 'ozma'
        }, {
            files: 'tpl/**/*.tpl',
            tasks: 'oz'
        }]
    });

    grunt.loadNpmTasks('grunt-istatic');
    grunt.loadNpmTasks('grunt-ozjs');
    grunt.loadNpmTasks('grunt-contrib-compass');
    
    grunt.registerTask('default', [
        'compass',
        'oz',
        'ozma'
    ]);

};
