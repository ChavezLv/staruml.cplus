#!/bin/bash

#jison "cpp.jison" "cpp.jisonlex"  -t -p lalr > jisonOutput.txt
#node compile.js
jison "cpp.jison" "cpp.jisonlex" -o "cpp.js" -t -p lalr > jisonOutput.txt