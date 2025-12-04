/*
 * Copyright (c) 2014 MKLab. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

const fs = require("fs");
const path = require("path");
const parser = require("./grammar/cpp");

// C++ Primitive Types
var cppPrimitiveTypes = [
  "sbyte",
  "short",
  "ushort",
  "uint",
  "long",
  "ulong",
  "char",
  "float",
  "double",
  "decimal",
  "bool",
  "void",
  "auto",
  "int",
  "short int",
  "long int",
  "long long",
  "long double",
  "signed int",
  "signed char",
  "signed long",
  "signed short",
  "signed short int",
  "signed long int",
  "signed long long",
  "signed",
  "unsigned",
  "unsigned int",
  "unsigned char",
  "unsigned long",
  "unsigned short",
  "unsigned short int",
  "unsigned long int",
  "unsigned long long",
];

// common typedefs and library types that shouldn't become classes
cppPrimitiveTypes.push("size_t");

/**
 * C++ Code Analyzer
 */
class CppCodeAnalyzer {
  /**
   * @constructor
   */
  constructor() {
    /** @member {type.UMLModel} */
    this._root = new type.UMLModel();
    this._root.name = "CppReverse";

    /** @member {Array.<File>} */
    this._files = [];

    /** @member {Object} */
    this._currentCompilationUnit = null;

    /**
     * @member {{classifier:type.UMLClassifier, node: Object, kind:string}}
     */
    this._extendPendings = [];

    /**
     * @member {{classifier:type.UMLClassifier, node: Object}}
     */
    this._implementPendings = [];

    /**
     * @member {{classifier:type.UMLClassifier, association: type.UMLAssociation, node: Object}}
     */
    this._associationPendings = [];

    /**
     * @member {{operation:type.UMLOperation, node: Object}}
     */
    this._throwPendings = [];

    /**
     * @member {{namespace:type.UMLModelElement, feature:type.UMLStructuralFeature, node: Object}}
     */
    this._typedFeaturePendings = [];

    /**
     * @member {{source:type.UMLClassifier, targetTypeName:string, node:Object}}
     */
    this._dependencyPendings = [];

    this._usingList = [];
  }

  /**
   * Add File to Reverse Engineer
   * @param {File} file
   */
  addFile(file) {
    this._files.push(file);
  }

  /**
   * Analyze all files.
   * @param {Object} options
   * @return {$.Promise}
   */
  analyze(options) {
    // Perform 1st Phase
    this.performFirstPhase(options);

    // Perform 2nd Phase
    this.performSecondPhase(options);

    // Load To Project
    var writer = new app.repository.Writer();
    writer.writeObj("data", this._root);
    var json = writer.current.data;
    app.project.importFromJson(app.project.getProject(), json);

    // Generate Diagrams
    this.generateDiagrams(options);
    console.log("[C++] done.");
  }

  /**
   * Generate Diagrams (Type Hierarchy, Package Structure, Package Overview)
   * @param {Object} options
   */
  generateDiagrams(options) {
    var baseModel = app.repository.get(this._root._id);
    if (options.packageStructure) {
      app.commands.execute(
        "diagram-generator:package-structure",
        baseModel,
        true,
      );
    }
    if (options.typeHierarchy) {
      app.commands.execute("diagram-generator:type-hierarchy", baseModel, true);
    }
    if (options.packageOverview) {
      baseModel.traverse((elem) => {
        if (elem instanceof type.UMLPackage) {
          var isRootWithSingleNamespace = elem === baseModel && elem.ownedElements.length === 1 &&
            elem.ownedElements[0] instanceof type.UMLPackage;
          if (isRootWithSingleNamespace) {
            return;
          }
          var hasClassesOrInterfaces = false;
          for (var i = 0; i < elem.ownedElements.length; i++) {
            var child = elem.ownedElements[i];
            if (child instanceof type.UMLClass || child instanceof type.UMLInterface ||
              child instanceof type.UMLEnumeration) {
              hasClassesOrInterfaces = true;
              break;
            }
          }
          if (!hasClassesOrInterfaces) {
            return;
          }
          if (options.packageOverviewSimple) {
            app.commands.execute("diagram-generator:overview", elem, true);
            this._renameDiagram(elem, elem.name + ' Overview (Simple)');
          }
          if (options.packageOverviewDetailed) {
            app.commands.execute("diagram-generator:overview-expanded", elem, true);
            this._renameDiagram(elem, elem.name + ' Overview (Detailed)');
          }
        }
      });
    }
  }
  
  /**
   * Rename the last generated diagram in the package
   * @param {type.UMLPackage} pkg
   * @param {string} newName
   */
  _renameDiagram(pkg, newName) {
    // Find the last generated diagram (Overview)
    for (var i = pkg.ownedElements.length - 1; i >= 0; i--) {
      var elem = pkg.ownedElements[i];
      if (elem instanceof type.UMLClassDiagram && elem.name === 'Overview') {
        // Rename it
        elem.name = newName;
        break;
      }
    }
  }

  /**
   * Find Type.
   *
   * @param {type.Model} namespace
   * @param {string|Object} type Type name string or type node.
   * @param {Object} compilationUnitNode To search type with import statements.
   * @return {type.Model} element correspond to the type.
   */
  _findType(namespace, type_, compilationUnitNode) {
    var typeName, pathName;
    var _type = null;

    // Defensive: if no type information provided, return null
    if (type_ === undefined || type_ === null) {
      return null;
    }

    typeName = type_;

    // If caller passed an object, try to read its name; otherwise bail out
    if (typeof typeName !== "string") {
      if (type_ && typeof type_.name === "string") {
        typeName = type_.name;
      } else {
        return null;
      }
    }

    pathName = [typeName];

    // 1. Lookdown from context
    if (pathName.length > 1) {
      _type = namespace.lookdown(pathName);
    } else {
      _type = namespace.findByName(typeName);
    }

    // 2. Lookup from context
    if (!_type) {
      _type = namespace.lookup(typeName, null, this._root);
    }

    // 3. Find from imported namespaces
    var i, len;
    if (!_type) {
      for (i = 0, len = this._usingList.length; i < len; i++) {
        var _import = this._usingList[i];
        // Find in import exact matches (e.g. import java.lang.String)
        _type = this._root.lookdown(_import.name);
      }
    }

    // 4. Lookdown from Root
    if (!_type) {
      if (pathName.length > 1) {
        _type = this._root.lookdown(pathName);
      } else {
        _type = this._root.findByName(typeName);
      }
    }

    return _type;
  }

  /**
   * Return the class of a given pathNames. If not exists, create the class.
   * @param {type.Model} namespace
   * @param {Array.<string>} pathNames
   * @return {type.Model} Class element corresponding to the pathNames
   */
  _ensureClass(namespace, pathNames) {
    if (pathNames.length > 0) {
      var _className = pathNames.pop();
      var _package = this._ensurePackage(namespace, pathNames);
      var _class = _package.findByName(_className);

      if (!_class) {
        _class = new type.UMLClass();
        _class._parent = _package;
        _class.name = _className;
        _class.visibility = type.UMLModelElement.VK_PUBLIC;
        _package.ownedElements.push(_class);
      }

      return _class;
    }
    return null;
  }

  /**
   * Test a given type is a generic collection or not
   * @param {Object} typeNode
   * @return {string} Collection item type name
   */
  _isGenericCollection(typeNode, compilationUnitNode) {
    return null;
  }

  /**
   * Normalize a type name by removing cv-qualifiers, pointers/references
   * and simple template arguments so the analyzer doesn't create
   * spurious classes for things like `const Foo &` or `std::string`.
   * @param {string} typeName
   * @return {string}
   */
  _normalizeTypeName(typeName) {
    if (!typeName) return typeName;
    var name = typeName;
    if (typeof name !== "string") {
      if (name && typeof name.name === "string") {
        name = name.name;
      } else {
        name = String(name);
      }
    }

    // collapse whitespace and trim
    name = name.replace(/\s+/g, " ").trim();

    // 为了让签名更简洁，把 C++ 标准库命名空间 std:: 隐藏掉
    // 例如：std::pair<int, std::string> -> pair<int, string>
    name = name.replace(/\bstd::/g, "");

    return name;
  }

  /**
   * Extract base type name from a type string, removing template arguments
   * and other qualifiers for dependency resolution.
   * @param {string} typeName
   * @return {string}
   */
  _extractBaseTypeName(typeName) {
    if (!typeName) return typeName;
    var name = this._normalizeTypeName(typeName);
    
    // Remove template arguments for dependency resolution
    // This helps find the actual class type without template parameters
    name = name.replace(/<[^<>]*>/g, "");
    
    // Remove cv-qualifiers and keywords
    name = name.replace(/\b(const|volatile|struct|class)\b/g, "");
    
    // Remove pointer/reference symbols
    name = name.replace(/[&*]/g, "");
    
    // Collapse whitespace and trim
    name = name.replace(/\s+/g, " ").trim();
    
    return name;
  }

  /**
   * Safely extract a string name from parser nodes.
   * 有些语法节点的 name 可能是对象（例如 {name:'Singleton', typeParameters:[...]}），
   * 这里统一收敛成字符串，避免把整个对象直接写进模型导致 Writer 报错。
   * @param {string|Object} nodeOrName
   * @return {string}
   */
  _toName(nodeOrName) {
    if (typeof nodeOrName === "string") {
      return nodeOrName;
    }
    if (!nodeOrName) {
      return "";
    }
    if (typeof nodeOrName.name === "string") {
      return nodeOrName.name;
    }
    return String(nodeOrName);
  }

  /**
   * Perform Second Phase
   *   - Create Generalizations
   *   - Create InterfaceRealizations
   *   - Create Fields or Associations
   *   - Resolve Type References
   *
   * @param {Object} options
   */
  performSecondPhase(options) {
    var i, len, j, len2, _typeName, _type, _itemTypeName, _itemType, _pathName;

    // Create Generalizations and Dependencies for base classes
    //     if super type not found, selectively create a Class correspond to the super type.
    for (i = 0, len = this._extendPendings.length; i < len; i++) {
      var _extend = this._extendPendings[i];
      _typeName = _extend.node;
      _type = this._findType(
        _extend.classifier,
        _typeName,
        _extend.compilationUnitNode,
      );

      if (!_type) {
        // 如果找不到基类，只在类型名是“简单标识符/命名空间名”时才自动建类，
        // 避免生成诸如 "Singleton<CacheManager>"、"LRUCache&" 这类垃圾类名。
        var _normName = this._normalizeTypeName(_typeName);
        if (
          _normName &&
          typeof _normName === "string" &&
          /^[A-Za-z_]\w*(::[A-Za-z_]\w*)*$/.test(_normName)
        ) {
          _pathName = [_normName];
          _type = this._ensureClass(this._root, _pathName);
        } else {
          // 不创建对应的 UMLClass，直接跳过这条继承关系
          continue;
        }
      }

      var generalization = new type.UMLGeneralization();
      generalization._parent = _extend.classifier;
      generalization.source = _extend.classifier;
      generalization.target = _type;
      _extend.classifier.ownedElements.push(generalization);
    }

    // Create Associations
    for (i = 0, len = this._associationPendings.length; i < len; i++) {
      var _asso = this._associationPendings[i];
      _typeName = _asso.node;
      _type = this._findType(
        _asso.classifier,
        _typeName,
        _asso.node.compilationUnitNode,
      );
      _itemTypeName = this._isGenericCollection(
        _asso.node.type,
        _asso.node.compilationUnitNode,
      );
      if (_itemTypeName) {
        _itemType = this._findType(
          _asso.classifier,
          _itemTypeName,
          _asso.node.compilationUnitNode,
        );
      } else {
        _itemType = null;
      }

      // if type found, add as Association
      if (_type || _itemType) {
        for (j = 0, len2 = _asso.node.name.length; j < len2; j++) {
          var variableNode = _asso.node.name[j];

          // Create Association
          var association = new type.UMLAssociation();
          association._parent = _asso.classifier;
          _asso.classifier.ownedElements.push(association);

          // Set End1
          association.end1.reference = _asso.classifier;
          association.end1.name = "";
          association.end1.visibility = type.UMLModelElement.VK_PACKAGE;
          association.end1.navigable = false;

          // Set End2
          if (_type) {
            association.end2.reference = _type;
          } else if (_itemType) {
            association.end2.reference = _itemType;
          }
          association.end2.name = variableNode.name;
          association.end2.visibility = this._getVisibility(
            _asso.node.modifiers,
          );
          association.end2.navigable = true;

          const typeStr = this._toName(_asso.node.type);
          const uniquePtrAsComposition = options && options.uniquePtrAsComposition !== false;
          const pointerAsAggregation = options && options.pointerAsAggregation !== false;
          const referenceAsAssociation = options && options.referenceAsAssociation !== false;
          let agg = 0;
          if (typeStr.includes("unique_ptr")) {
            agg = uniquePtrAsComposition ? 2 : (pointerAsAggregation ? 1 : 0);
          } else if (typeStr.includes("*") || typeStr.includes("shared_ptr")) {
            agg = pointerAsAggregation ? 1 : 0;
          } else if (typeStr.includes("&")) {
            agg = referenceAsAssociation ? 0 : 1;
          } else {
            agg = 2;
          }
          association.end2.aggregation = agg;

          // Final Modifier
          if (_asso.node.modifiers && _asso.node.modifiers.includes("final")) {
            association.end2.isReadOnly = true;
          }

          // Static Modifier
          if (_asso.node.modifiers && _asso.node.modifiers.includes("static")) {
            this._addTag(association.end2, type.Tag.TK_BOOLEAN, "static", true);
          }

          // Volatile Modifier
          if (
            _asso.node.modifiers &&
            _asso.node.modifiers.includes("volatile")
          ) {
            this._addTag(
              association.end2,
              type.Tag.TK_BOOLEAN,
              "volatile",
              true,
            );
          }

          // Transient Modifier
          if (
            _asso.node.modifiers &&
            _asso.node.modifiers.includes("transient")
          ) {
            this._addTag(
              association.end2,
              type.Tag.TK_BOOLEAN,
              "transient",
              true,
            );
          }
        }
        // if type not found, add as Attribute
      } else {
        this.translateFieldAsAttribute(options, _asso.classifier, _asso.node);
      }
    }

    // Resolve Type References
    for (i = 0, len = this._typedFeaturePendings.length; i < len; i++) {
      var _typedFeature = this._typedFeaturePendings[i];
      _typeName = _typedFeature.node.type;

      // Find type and assign
      _type = this._findType(
        _typedFeature.namespace,
        _typeName,
        _typedFeature.node.compilationUnitNode,
      );

      // if type is exists
      if (_type) {
        _typedFeature.feature.type = _type;
      } else {
        // if type is not exists
        // if type is generic collection type (e.g. java.util.List<String>)
        _itemTypeName = this._isGenericCollection(
          _typedFeature.node.type,
          _typedFeature.node.compilationUnitNode,
        );
        if (_itemTypeName) {
          _typeName = _itemTypeName;
          _typedFeature.feature.multiplicity = "*";

          // collection 标签只需要一个可序列化的字符串，避免把整个 AST 对象塞进去
          var _collRaw = _typedFeature.node.type;
          var _collText =
            typeof _collRaw === "string"
              ? _collRaw
              : this._normalizeTypeName(_collRaw) ||
                (typeof _collRaw === "object"
                  ? JSON.stringify(_collRaw)
                  : String(_collRaw));

          this._addTag(
            _typedFeature.feature,
            type.Tag.TK_STRING,
            "collection",
            _collText,
          );
        }

        // normalize the type name (strip const/*/&/templates)
        var _norm = this._normalizeTypeName(_typeName);

        // If normalization produced nothing (e.g. parser couldn't determine type),
        // 避免把 JS 对象直接变成 "[object Object]"，直接视为未知类型。
        if (!_norm || typeof _norm !== "string") {
          _typedFeature.feature.type = null;
          continue;
        }

        // treat common library types and primitives as opaque (no class creation)
        if (cppPrimitiveTypes.includes(_norm) || /^[a-z0-9_]+_t$/i.test(_norm)) {
          _typedFeature.feature.type = _norm;
        } else if (_norm.indexOf("std::") === 0) {
          // For std:: types, strip std:: only for common string types
          var m = _norm.match(/^std::(string|wstring|u16string|u32string)$/);
          _typedFeature.feature.type = m ? m[1] : _norm;
        } else {
          // 对于非原生/非 std:: 基础类型，如果在模型中没有定义对应类，
          // 不再强行创建一个独立 UMLClass（例如 "LRUCache&"、"list<pair<string,string>>&"）。
          // 直接把规范化后的类型名当作字符串类型使用即可。
          _typedFeature.feature.type = _norm;
        }
      }

      // Translate type's arrayDimension to multiplicity
      if (_typedFeature.node.type && _typedFeature.node.type.length > 0) {
        var _dim = [];
        for (j = 0, len2 = _typedFeature.node.type.length; j < len2; j++) {
          if (_typedFeature.node.type[j] === "[") {
            _dim.push("*");
          }
        }
        _typedFeature.feature.multiplicity = _dim.join(",");
      }
    }

    // Create Dependencies (avoid duplicates)
    var createdDependencies = new Set();
    for (i = 0, len = this._dependencyPendings.length; i < len; i++) {
      var _dep = this._dependencyPendings[i];
      _typeName = _dep.targetTypeName;
      _type = this._findType(
        _dep.source,
        _typeName,
        _dep.node.compilationUnitNode,
      );

      if (_type) {
        // Create a unique key for this dependency
        var depKey = _dep.source._id + "->" + _type._id;
        if (!createdDependencies.has(depKey)) {
          // Create Dependency
          var dependency = new type.UMLDependency();
          dependency._parent = _dep.source;
          dependency.source = _dep.source;
          dependency.target = _type;
          _dep.source.ownedElements.push(dependency);
          createdDependencies.add(depKey);
        }
      }
    }
  }

  /**
   * Translate C++ CompilationUnit Node.
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} compilationUnitNode
   */
  translateCompilationUnit(options, namespace, compilationUnitNode) {
    var _namespace = namespace;
    this.translateTypes(options, _namespace, compilationUnitNode["member"]);
  }

  /**
   * Translate Type Nodes
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Array.<Object>} typeNodeArray
   */
  translateTypes(options, namespace, typeNodeArray) {
    var _namespace = namespace;
    var i, len;
    if (typeNodeArray.length > 0) {
      for (i = 0, len = typeNodeArray.length; i < len; i++) {
        var typeNode = typeNodeArray[i];
        switch (typeNode.node) {
          case "namespace":
            var _package = this.translatePackage(options, _namespace, typeNode);
            if (_package !== null) {
              _namespace = _package;
            }
            // Translate Types
            this.translateTypes(options, _namespace, typeNode.body);
            break;
          case "class":
          case "struct":
            this.translateClass(options, namespace, typeNode);
            break;
          case "enum":
            this.translateEnum(options, namespace, typeNode);
            break;
          case "using":
            this._usingList.push(typeNode);
            break;
        }
      }
    }
  }

  /**
   * Translate C++ Enum Node.
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} enumNode
   */
  translateEnum(options, namespace, enumNode) {
    var _enum;

    // Create Enumeration
    _enum = new type.UMLEnumeration();
    _enum._parent = namespace;
    _enum.name = this._toName(enumNode.name);
    _enum.visibility = this._getVisibility(enumNode.modifiers);

    // CppDoc
    //        if (enumNode.comment) {
    //            _enum.documentation = enumNode.comment;
    //        }
    namespace.ownedElements.push(_enum);

    // Translate Type Parameters
    //        this.translateTypeParameters(options, _enum, enumNode.typeParameters);
    if (enumNode.body !== "{") {
      // Translate Members
      this.translateMembers(options, _enum, enumNode.body);
    }
  }

  /**
   * Translate C++ Class Node.
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} compilationUnitNode
   */
  translateClass(options, namespace, classNode) {
    var i, len, _class;

    // 跳过纯前置声明：例如 "class EventLoop;"、"class TcpConnection;"
    // 这类产生式在 AST 中不会带有 body 属性，而真正的类定义（即便是空类）
    // 也会通过 "body": $2 这样的语义动作生成 body 属性（值可能是 undefined）。
    if (!Object.prototype.hasOwnProperty.call(classNode, "body")) {
      return;
    }

    // Create or reuse Class，避免生成重复的空同名类
    var className = this._toName(classNode.name);
    _class = namespace.findByName(className);
    if (!_class || !(_class instanceof type.UMLClass)) {
      _class = new type.UMLClass();
      _class._parent = namespace;
      _class.name = className;
      namespace.ownedElements.push(_class);
    }

    // Access Modifiers（后出现的声明可以覆盖前面的可见性）
    _class.visibility = this._getVisibility(classNode.modifiers);

    // Abstract Class
    if (classNode.modifiers && classNode.modifiers.includes("abstract")) {
      _class.isAbstract = true;
    }

    // Final Class

    // CppDoc
    //        if (classNode.comment) {
    //            _class.documentation = classNode.comment;
    //        }

    // Register Extends for 2nd Phase Translation
    if (classNode["base"]) {
      for (i = 0, len = classNode["base"].length; i < len; i++) {
        var _extendPending = {
          classifier: _class,
          node: classNode["base"][i],
          kind: "class",
          compilationUnitNode: this._currentCompilationUnit,
        };
        this._extendPendings.push(_extendPending);
      }
    }

    // Translate Type Parameters
    //        this.translateTypeParameters(options, _class, classNode.typeParameters);

    if (classNode.body && classNode.body !== "{") {
      // Translate Types
      this.translateTypes(options, _class, classNode.body);
      // Translate Members
      this.translateMembers(options, _class, classNode.body);
    }
  }

  /**
   * Translate Members Nodes
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Array.<Object>} memberNodeArray
   */
  translateMembers(options, namespace, memberNodeArray) {
    var i, len;
    if (memberNodeArray.length > 0) {
      for (i = 0, len = memberNodeArray.length; i < len; i++) {
        var memberNode = memberNodeArray[i];
        var visibility = this._getVisibility(memberNode.modifiers);

        // Generate public members only if publicOnly == true
        if (
          options.publicOnly &&
          visibility !== type.UMLModelElement.VK_PUBLIC
        ) {
          continue;
        }

        memberNode.compilationUnitNode = this._currentCompilationUnit;

        switch (memberNode.node) {
          case "field":
          case "property":
            if (options.association) {
              this.translateFieldAsAssociation(options, namespace, memberNode);
            } else {
              this.translateFieldAsAttribute(options, namespace, memberNode);
            }
            break;
          case "constructor":
            this.translateMethod(options, namespace, memberNode, true);
            break;
          case "method":
            this.translateMethod(options, namespace, memberNode);
            break;
          case "constant":
            //                    this.translateEnumConstant(options, namespace, memberNode);
            break;
        }
      }
    }
  }

  /**
   * Translate Method
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} methodNode
   * @param {boolean} isConstructor
   */
  translateMethod(options, namespace, methodNode, isConstructor) {
    var i, len;
    var _operation = new type.UMLOperation();
    _operation._parent = namespace;
    _operation.name = this._toName(methodNode.name);

    if (!isConstructor) {
      _operation.name = this._toName(methodNode.name);
    }

    namespace.operations.push(_operation);

    // Modifiers
    _operation.visibility = this._getVisibility(methodNode.modifiers);
    if (methodNode.modifiers && methodNode.modifiers.includes("static")) {
      _operation.isStatic = true;
    }
    if (methodNode.modifiers && methodNode.modifiers.includes("abstract")) {
      _operation.isAbstract = true;
    }

    // Constructor
    if (isConstructor) {
      _operation.stereotype = "constructor";
    }

    // Formal Parameters
    if (methodNode.parameter && methodNode.parameter.length > 0) {
      for (i = 0, len = methodNode.parameter.length; i < len; i++) {
        var parameterNode = methodNode.parameter[i];
        parameterNode.compilationUnitNode = methodNode.compilationUnitNode;
        this.translateParameter(options, _operation, parameterNode);
        
        // Add dependency for parameter type
        var paramTypeName = this._extractBaseTypeName(parameterNode.type);
        if (paramTypeName && typeof paramTypeName === "string" && paramTypeName !== "" && !cppPrimitiveTypes.includes(paramTypeName)) {
          this._dependencyPendings.push({
            source: namespace,
            targetTypeName: paramTypeName,
            node: parameterNode,
          });
        }
      }
    }

    // Return Type
    if (methodNode.type) {
      var _returnParam = new type.UMLParameter();
      _returnParam._parent = _operation;
      _returnParam.name = "";
      _returnParam.direction = type.UMLParameter.DK_RETURN;
      // Add to _typedFeaturePendings
      this._typedFeaturePendings.push({
        namespace: namespace,
        feature: _returnParam,
        node: methodNode,
      });
      _operation.parameters.push(_returnParam);
      
      // Add dependency for return type
      var returnTypeName = this._extractBaseTypeName(methodNode.type);
      if (returnTypeName && typeof returnTypeName === "string" && returnTypeName !== "" && !cppPrimitiveTypes.includes(returnTypeName)) {
        this._dependencyPendings.push({
          source: namespace,
          targetTypeName: returnTypeName,
          node: methodNode,
        });
      }
    }

    // Throws
    //        if (methodNode.throws) {
    //            for (i = 0, len = methodNode.throws.length; i < len; i++) {
    //                var _throwNode = methodNode.throws[i];
    //                var _throwPending = {
    //                    operation: _operation,
    //                    node: _throwNode,
    //                    compilationUnitNode: methodNode.compilationUnitNode
    //                };
    //                this._throwPendings.push(_throwPending);
    //            }
    //        }

    // CppDoc
    //        if (methodNode.comment) {
    //            _operation.documentation = methodNode.comment;
    //        }

    // "default" for Annotation Type Element
    //        if (methodNode.defaultValue) {
    //            this._addTag(_operation, type.Tag.TK_STRING, "default", methodNode.defaultValue);
    //        }

    // Translate Type Parameters
    //        this.translateTypeParameters(options, _operation, methodNode.typeParameters);
  }

  /**
   * Translate Method Parameters
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} parameterNode
   */
  translateParameter(options, namespace, parameterNode) {
    var _parameter = new type.UMLParameter();
    _parameter._parent = namespace;
    _parameter.name = this._toName(parameterNode.name);
    // Set parameter direction to 'in' so it displays correctly in diagrams
    _parameter.direction = type.UMLParameter.DK_IN;
    namespace.parameters.push(_parameter);

    // Add to _typedFeaturePendings
    this._typedFeaturePendings.push({
      namespace: namespace._parent,
      feature: _parameter,
      node: parameterNode,
    });
  }

  /**
   * Translate C++ Field Node as UMLAttribute.
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} fieldNode
   */
  translateFieldAsAttribute(options, namespace, fieldNode) {
    var i, len;
    if (fieldNode.name && fieldNode.name.length > 0) {
      for (i = 0, len = fieldNode.name.length; i < len; i++) {
        var variableNode = fieldNode.name[i];

        // Create Attribute
        var _attribute = new type.UMLAttribute();
        _attribute._parent = namespace;
        _attribute.name = this._toName(variableNode.name);

        // Access Modifiers
        _attribute.visibility = this._getVisibility(fieldNode.modifiers);
        if (variableNode.initialize) {
          _attribute.defaultValue = variableNode.initialize;
        }

        // Static Modifier
        if (fieldNode.modifiers && fieldNode.modifiers.includes("static")) {
          _attribute.isStatic = true;
        }

        // Final Modifier

        // Volatile Modifier
        if (fieldNode.modifiers && fieldNode.modifiers.includes("volatile")) {
          this._addTag(_attribute, type.Tag.TK_BOOLEAN, "volatile", true);
        }

        // CppDoc
        //                if (fieldNode.comment) {
        //                    _attribute.documentation = fieldNode.comment;
        //                }

        namespace.attributes.push(_attribute);

        // Add to _typedFeaturePendings
        var _typedFeature = {
          namespace: namespace,
          feature: _attribute,
          node: fieldNode,
        };
        this._typedFeaturePendings.push(_typedFeature);
        
        // Add dependency for attribute type
        var attrTypeName = this._extractBaseTypeName(fieldNode.type);
        if (attrTypeName && typeof attrTypeName === "string" && attrTypeName !== "" && !cppPrimitiveTypes.includes(attrTypeName)) {
          this._dependencyPendings.push({
            source: namespace,
            targetTypeName: attrTypeName,
            node: fieldNode,
          });
        }
      }
    }
  }

  /**
   * Add a Tag
   * @param {type.Model} elem
   * @param {string} kind Kind of Tag
   * @param {string} name
   * @param {?} value Value of Tag
   */
  _addTag(elem, kind, name, value) {
    var tag = new type.Tag();
    tag._parent = elem;
    tag.name = name;
    tag.kind = kind;
    switch (kind) {
      case type.Tag.TK_STRING:
        // Writer 要求 value 必须是 string/number/boolean，这里统一做一次安全转换
        if (
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean"
        ) {
          try {
            // 尽量以 JSON 形式保留信息
            tag.value = JSON.stringify(value);
          } catch (e) {
            tag.value = String(value);
          }
        } else {
          tag.value = value;
        }
        break;
      case type.Tag.TK_BOOLEAN:
        tag.checked = value;
        break;
      case type.Tag.TK_NUMBER:
        tag.number = value;
        break;
      case type.Tag.TK_REFERENCE:
        tag.reference = value;
        break;
      case type.Tag.TK_HIDDEN:
        // 对 HIDDEN 同样做一次类型规整，避免把对象直接塞进去
        if (
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean"
        ) {
          try {
            tag.value = JSON.stringify(value);
          } catch (e2) {
            tag.value = String(value);
          }
        } else {
          tag.value = value;
        }
        break;
    }
    elem.tags.push(tag);
  }

  /**
   * Translate C++ Field Node as UMLAssociation.
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} fieldNode
   */
  translateFieldAsAssociation(options, namespace, fieldNode) {
    if (fieldNode.name && fieldNode.name.length > 0) {
      // Add to _associationPendings
      var _associationPending = {
        classifier: namespace,
        node: fieldNode,
      };
      this._associationPendings.push(_associationPending);
    }
  }

  /**
   * Return visiblity from modifiers
   *
   * @param {Array.<string>} modifiers
   * @return {string} Visibility constants for UML Elements
   */
  _getVisibility(modifiers) {
    modifiers = modifiers || [];
    if (modifiers.includes("public")) {
      return type.UMLModelElement.VK_PUBLIC;
    } else if (modifiers.includes("protected")) {
      return type.UMLModelElement.VK_PROTECTED;
    } else if (modifiers.includes("private")) {
      return type.UMLModelElement.VK_PRIVATE;
    }
    return type.UMLModelElement.VK_PACKAGE;
  }

  /**
   * Translate C++ Package Node.
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} compilationUnitNode
   */
  translatePackage(options, namespace, packageNode) {
    if (packageNode && packageNode.name) {
      var packageName = packageNode.name;
      return this._ensurePackage(namespace, packageName);
    }
    return null;
  }

  /**
   * Return the package of a given packageName. If not exists, create the package.
   * @param {type.Model} namespace
   * @param {Array.<string>} packageName
   * @return {type.Model} Package element corresponding to the packageName
   */
  _ensurePackage(namespace, packageName) {
    if (packageName.length > 0) {
      var name = packageName;
      if (name && name.length > 0) {
        var elem = namespace.findByName(name);
        if (elem !== null) {
          // Package exists
          return elem;
        } else {
          // Package not exists, then create one.
          var _package = new type.UMLPackage();
          namespace.ownedElements.push(_package);
          _package._parent = namespace;
          _package.name = name;
          return _package;
        }
      }
    } else {
      return namespace;
    }
  }

  /**
   * Perform First Phase
   *   - Create Packages, Classes, Interfaces, Enums, AnnotationTypes.
   *
   * @param {Object} options
   * @return {$.Promise}
   */
  performFirstPhase(options) {
    this._files.forEach((file) => {
      var data = fs.readFileSync(file, "utf8");
      try {
        var ast = parser.parse(data);
        var results = [];
        for (var property in ast) {
          var value = ast[property];
          if (value) {
            results.push(property.toString() + ": " + value);
          }
        }
        this._currentCompilationUnit = ast;
        this._currentCompilationUnit.file = file;
        this.translateCompilationUnit(options, this._root, ast);
      } catch (ex) {
        console.error("[C++] Failed to parse - " + file);
        console.error(ex);
      }
    });
  }
}

/**
 * Analyze all C++ files in basePath
 * @param {string} basePath
 * @param {Object} options
 */
function analyze(basePath, options) {
  var cppAnalyzer = new CppCodeAnalyzer();

  function visit(base) {
    var stat = fs.lstatSync(base);
    if (stat.isFile()) {
      var ext = path.extname(base).toLowerCase();
      if (ext === ".cpp" || ext === ".h") {
        cppAnalyzer.addFile(base);
      }
    } else if (stat.isDirectory()) {
      var files = fs.readdirSync(base);
      if (files && files.length > 0) {
        files.forEach((entry) => {
          var fullPath = path.join(base, entry);
          visit(fullPath);
        });
      }
    }
  }

  // Traverse all file entries
  visit(basePath);

  // Perform reverse engineering
  cppAnalyzer.analyze(options);
}

exports.analyze = analyze;
