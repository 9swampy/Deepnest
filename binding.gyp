{
    "targets": [
        {
            "target_name": "addon",
            "sources": [ "addon.cc", "minkowski.cc" ],
            'cflags!': [ '-fno-exceptions', "-m32" ],
            "ldflags": [ "-m elf_i386" ],
            'cflags_cc!': [ '-fno-exceptions', '-fPIC -m32' ],
            "include_dirs" : [
 	 		                          "<!(node -e \"require('nan')\")",
                                "D:/boost_1_76_0"
		                        ]
        }
    ],
}
