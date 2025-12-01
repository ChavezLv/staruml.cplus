#!/bin/bash

#jison "cpp.jison" "cpp.jisonlex"  -t -p lalr > jisonOutput.txt
jison "cpp.jison" "cpp.jisonlex" -o "cpp.js" -t -p lalr > jisonOutput.txt

