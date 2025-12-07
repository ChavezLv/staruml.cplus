const jison = require('jison');
const fs = require('fs');

console.log('开始编译cpp.jison...');
const startTime = Date.now();

// 读取语法文件
const grammar = fs.readFileSync('cpp.jison', 'utf8');

// 创建解析器
const parser = new jison.Parser(grammar, {
  lex: {
    file: 'cpp.jisonlex'
  }
});

// 生成JavaScript代码
const output = parser.generate({
  moduleType: 'commonjs'
});

// 写入输出文件
fs.writeFileSync('cpp.js', output);

const endTime = Date.now();
const compileTime = (endTime - startTime) / 1000;

// 输出到控制台和文件
const result = `编译完成！耗时: ${compileTime} 秒`;
console.log(result);
//fs.writeFileSync('compile_result.txt', result);
