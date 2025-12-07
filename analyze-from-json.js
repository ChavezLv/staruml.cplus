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

/**
 * JSON Code Analyzer
 */
class JsonCodeAnalyzer {
  /**
   * @constructor
   * @param {Object} options - Options for the analyzer
   * @param {string} modelName - Name for the UMLModel
   */
  constructor(options = {}, modelName = "CppReverse") {
    // For class diagrams, we create a UMLModel
    this._root = new type.UMLModel();
    this._root.name = modelName;

    // Map to store class ID to class object for inheritance processing
    this._classIdMap = {};
    
    // For sequence diagrams
    this._collaboration = null;
    this._interaction = null;
    this._sequenceDiagram = null;
    this._participantMap = {};
  }

  /**
   * Add JSON file to Reverse Engineer
   * @param {string} jsonPath
   */
  addJsonFile(jsonPath) {
    try {
      const jsonContent = fs.readFileSync(jsonPath, "utf8");
      const diagramJson = JSON.parse(jsonContent);
      
      // Check diagram type
      const diagramType = diagramJson.diagram_type || "class";
      
      // Process based on diagram type
      if (diagramType === "sequence") {
        // Process sequence diagram
        this.translateJsonSequenceDiagram({}, diagramJson);
      } else {
        // Process as class diagram
        this.translateJsonClassDiagram({}, this._root, diagramJson);
      }
    } catch (err) {
      console.error(`Error parsing JSON file ${jsonPath}:`, err);
    }
  }

  /**
   * Analyze JSON files and create project
   * @param {Object} options
   */
  analyze(options) {
    if (this._collaboration) {
      // For sequence diagram, import the collaboration (which contains interaction and sequence diagram)
      var writer = new app.repository.Writer();
      writer.writeObj("data", this._collaboration);
      var json = writer.current.data;
      app.project.importFromJson(app.project.getProject(), json);
      // Sequence diagram structure has been imported successfully
      this.generateDiagrams(options);
    } else {
      // For class diagram, use existing import method
      // Load To Project
      var writer = new app.repository.Writer();
      writer.writeObj("data", this._root);
      var json = writer.current.data;
      app.project.importFromJson(app.project.getProject(), json);

      // Generate Diagrams
      this.generateDiagrams(options);
    }
  }

  /**
   * Generate Diagrams (Type Hierarchy, Package Structure, Package Overview)
   * @param {Object} options
   */
  generateDiagrams(options) {
    if(this._collaboration){
      var baseModel = app.repository.get(this._interaction._id);
            baseModel.traverse((elem) => {
            console.log("[JSON Reverse Engineer] Sequence diagram:elem:\n");
            console.dir(elem, { depth: null, colors: true });
            app.commands.execute("diagram-generator:sequence", elem, true);
      });
    }else{
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
   * Add a tag to an element
   * @param {type.ModelElement} elem
   * @param {number} kind
   * @param {string} name
   * @param {any} value
   */
  _addTag(elem, kind, name, value) {
    var tag = new type.Tag();
    tag._parent = elem;
    tag.name = name;
    tag.kind = kind;
    switch (kind) {
      case type.Tag.TK_STRING:
        tag.value = value;
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
        tag.value = value;
        break;
      default:
        tag.value = value;
        break;
    }
    if (!elem.tags) {
      elem.tags = [];
    }
    elem.tags.push(tag);
  }
  
  /**
   * Translate JSON Class Diagram to UML model
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} classDiagram
   */
  translateJsonClassDiagram(options, namespace, classDiagram) {
    if (classDiagram.elements) {
      for (const element of classDiagram.elements) {
        switch (element.type) {
          case "class":
          case "struct":
            this.translateJsonClass(options, namespace, element);
            break;
          case "enum":
            this.translateJsonEnum(options, namespace, element);
            break;
        }
      }
    }
    
    // Process relationships after all elements are created
    if (classDiagram.relationships) {
      for (const relationship of classDiagram.relationships) {
        this.translateJsonRelationship(options, namespace, relationship);
      }
    }
  }
  
  /**
   * Translate JSON Relationship to UML relationship
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} relationshipNode
   */
  translateJsonRelationship(options, namespace, relationshipNode) {
    // Get source and target classes from ID map
    const sourceClass = this._classIdMap[relationshipNode.source];
    const targetClass = this._classIdMap[relationshipNode.destination];

    // Skip if either class is not found
    if (!sourceClass || !targetClass) {
      console.warn(`Skipping relationship: source or target class not found (${relationshipNode.source} -> ${relationshipNode.destination})`);
      return;
    }
    if(sourceClass.name == targetClass.name){
      return;
    }
    let relationship;
    
    switch (relationshipNode.type) {
      case "dependency":
        relationship = new type.UMLDependency();
        
        // For dependency, add label as a tag if needed
        if (relationshipNode.label) {
          this._addTag(relationship, type.Tag.TK_STRING, "label", relationshipNode.label);
        }
        break;
        
      case "association":
      case "aggregation":
      case "composition":
        relationship = new type.UMLAssociation();
        
        // Set association end names
        if (relationshipNode.label) {
          relationship.name = relationshipNode.label;
        }
        
        // Initialize association ends properly
        if (!relationship.end1) {
          relationship.end1 = {};
        }
        if (!relationship.end2) {
          relationship.end2 = {};
        }
        
        // Set multiplicities (default is 1 for both ends)
        relationship.end1.multiplicity = "";
        relationship.end2.multiplicity = "";
        
        // Set navigability
        relationship.end1.navigable = false;
        relationship.end2.navigable = false;
        
        // Set aggregation/composition kind according to UML standard
        relationship.end1.aggregation = undefined; // Default to regular association
        relationship.end2.aggregation = undefined; // Default to regular association
        
        if (relationshipNode.type === "aggregation") {
          relationship.end2.aggregation = "shared"; // Hollow diamond (aggregation)
        } else if (relationshipNode.type === "association") {
          relationship.end2.aggregation = "composite"; // Solid diamond (composition)
        } else {
          // Regular association, no aggregation
          relationship.end2.aggregation = undefined;
        }
        break;
        
      case "extension":
        // Extension is typically used for inheritance
        if (sourceClass && targetClass) {
          // Check if generalization already exists before creating
          let generalizationExists = false;
          for (const elem of sourceClass.ownedElements) {
            if (elem instanceof type.UMLGeneralization && elem.target === targetClass) {
              generalizationExists = true;
              break;
            }
          }
          
          // Create generalization only if it doesn't already exist
          if (!generalizationExists) {
            // Create generalization directly
            const generalization = new type.UMLGeneralization();
            generalization.source = sourceClass;
            generalization.target = targetClass;
            generalization.visibility = this._getJsonVisibility(relationshipNode.access);
            generalization._parent = sourceClass;
            sourceClass.ownedElements.push(generalization);
          }
        } else {
          console.warn("Skipping generalization creation: source or target class is undefined");
        }
        return;
        
      default:
        console.warn(`Unknown relationship type: ${relationshipNode.type}`);
        return;
    }
    
    // Make sure both source and target classes exist before setting any references
    if (!sourceClass || !targetClass) {
      console.warn(`Skipping relationship creation: sourceClass=${sourceClass ? 'exists' : 'undefined'}, targetClass=${targetClass ? 'exists' : 'undefined'}`);
      return;
    }
    
    // Set source and target for UMLDependency
    if (relationship instanceof type.UMLDependency) {
      // Make sure both source and target classes exist
      if (sourceClass && targetClass) {
        relationship.source = sourceClass;
        relationship.target = targetClass;
        
        // Set visibility
        relationship.visibility = this._getJsonVisibility(relationshipNode.access);
        
        // Add relationship to source class instead of namespace
        relationship._parent = sourceClass;
        sourceClass.ownedElements.push(relationship);
      } else {
        console.warn("Skipping dependency creation: source or target class is undefined");
        return;
      }
    }
    // Set association ends references for UMLAssociation
    else if (relationship instanceof type.UMLAssociation) {
      // Make sure both source and target classes exist
      if (sourceClass && targetClass) {
        relationship.end1.reference = sourceClass;
        relationship.end2.reference = targetClass;
        
        // Set visibility
        relationship.visibility = this._getJsonVisibility(relationshipNode.access);
        
        // Add relationship to source class instead of namespace
        relationship._parent = sourceClass;
        sourceClass.ownedElements.push(relationship);
      } else {
        console.warn("Skipping association creation: source or target class is undefined");
        return;
      }
    }
  }

  /**
   * Translate JSON Class Node
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} classNode
   */
  translateJsonClass(options, namespace, classNode) {
    // Create Class or Struct
    const _class = new type.UMLClass();
    _class._parent = namespace;
    _class.name = classNode.name;
    _class.visibility = this._getJsonVisibility(classNode.access);
    
    // Set struct flag if needed
    if (classNode.is_struct) {
      this._addTag(_class, type.Tag.TK_BOOLEAN, "struct", true);
    }
    
    // Set abstract flag if needed
    if (classNode.is_abstract) {
      _class.isAbstract = true;
    }
    
    namespace.ownedElements.push(_class);
    
    // Store class ID to object mapping
    if (classNode.id) {
      this._classIdMap[classNode.id] = _class;
    }
    
    // Process inheritance - directly create generalizations here instead of using _extendPendings
    if (classNode.bases) {
      for (const base of classNode.bases) {
        let _type;
        
        // Check if we have JSON-based inheritance (with ID)
        if (base.id) {
          // Get base class from ID map
          _type = this._classIdMap[base.id];
        }
        
        // If type not found by ID, try to find by name (if available)
        if (!_type && base.name) {
          _type = this._findType(
            _class,
            base.name,
            _class.compilationUnitNode
          );
        }
        
        if (!_type) {
          // Skip if base class not found and no valid name provided
          continue;
        }
        
        // Check if generalization already exists before creating
        let generalizationExists = false;
        for (const elem of _class.ownedElements) {
          if (elem instanceof type.UMLGeneralization && elem.target === _type) {
            generalizationExists = true;
            break;
          }
        }
        
        // Create generalization only if it doesn't already exist
        if (!generalizationExists) {
          const generalization = new type.UMLGeneralization();
          generalization._parent = _class;
          generalization.source = _class;
          generalization.target = _type;
          _class.ownedElements.push(generalization);
        }
      }
    }
    
    // Process attributes (JSON uses 'members' for attributes)
    if (classNode.members) {
      for (const member of classNode.members) {
        // Check if it's an attribute (not a method - methods have parameters)
        if (!member.parameters) {
          this.translateJsonAttribute(options, _class, member);
        }
      }
    }
    
    // Process methods
    if (classNode.methods) {
      for (const method of classNode.methods) {
        this.translateJsonMethod(options, _class, method);
      }
    }
  }

  /**
   * Translate JSON Attribute
   * @param {Object} options
   * @param {type.Model} parent
   * @param {Object} attrNode
   */
  translateJsonAttribute(options, parent, attrNode) {
    // Create Attribute
    const _attr = new type.UMLAttribute();
    _attr._parent = parent;
    _attr.name = attrNode.name;
    _attr.type = attrNode.type;
    _attr.visibility = this._getJsonVisibility(attrNode.access);
    
    // Set static flag if needed
    if (attrNode.is_static) {
      _attr.isStatic = true;
    }
    
    parent.attributes.push(_attr);
  }

  /**
   * Translate JSON Method
   * @param {Object} options
   * @param {type.Model} parent
   * @param {Object} methodNode
   */
  translateJsonMethod(options, parent, methodNode) {
    // Skip destructors for now
    if (methodNode.name.startsWith("~") && !methodNode.is_operator) {
      return;
    }
    
    // Create Operation
    const _operation = new type.UMLOperation();
    _operation._parent = parent;
    _operation.name = methodNode.name;
    _operation.visibility = this._getJsonVisibility(methodNode.access);
    
    // Set constructor flag
    if (methodNode.is_constructor) {
      this._addTag(_operation, type.Tag.TK_BOOLEAN, "constructor", true);
    }
    
    // Set virtual flags
    if (methodNode.is_virtual) {
      _operation.isAbstract = false;
      this._addTag(_operation, type.Tag.TK_BOOLEAN, "virtual", true);
    }
    
    if (methodNode.is_pure_virtual) {
      _operation.isAbstract = true;
    }
    
    // Set static flag
    if (methodNode.is_static) {
      _operation.isStatic = true;
    }
    
    // Set const flag
    if (methodNode.is_const) {
      this._addTag(_operation, type.Tag.TK_BOOLEAN, "const", true);
    }
    
    // Process parameters
    if (methodNode.parameters) {
      for (const param of methodNode.parameters) {
        const _param = new type.UMLParameter();
        _param._parent = _operation;
        _param.name = param.name || "";
        _param.type = param.type;
        _operation.parameters.push(_param);
      }
    }
    
    // Set return type for non-constructors
    if (!methodNode.is_constructor) {
      const returnParam = new type.UMLParameter();
      returnParam._parent = _operation;
      returnParam.name = "";
      returnParam.type = methodNode.type;
      returnParam.direction = type.UMLParameter.DK_RETURN;
      _operation.parameters.push(returnParam);
    }
    
    parent.operations.push(_operation);
  }

  /**
   * Translate JSON Enum Node
   * @param {Object} options
   * @param {type.Model} namespace
   * @param {Object} enumNode
   */
  translateJsonEnum(options, namespace, enumNode) {
    // Create Enumeration
    const _enum = new type.UMLEnumeration();
    _enum._parent = namespace;
    _enum.name = enumNode.name;
    _enum.visibility = this._getJsonVisibility(enumNode.access);
    
    namespace.ownedElements.push(_enum);
    
    // Store enum ID to object mapping
    if (enumNode.id) {
      this._classIdMap[enumNode.id] = _enum;
    }
    
    // Process enumerators
    if (enumNode.enumerators) {
      for (const enumItem of enumNode.enumerators) {
        const _literal = new type.UMLEnumerationLiteral();
        _literal._parent = _enum;
        _literal.name = enumItem.name;
        _enum.ownedElements.push(_literal);
      }
    }
  }

  /**
   * Get visibility from JSON access level
   * @param {string} access
   * @return {string} Visibility constants for UML Elements
   */
  _getJsonVisibility(access) {
    switch (access) {
      case "public":
        return type.UMLModelElement.VK_PUBLIC;
      case "protected":
        return type.UMLModelElement.VK_PROTECTED;
      case "private":
        return type.UMLModelElement.VK_PRIVATE;
      default:
        return type.UMLModelElement.VK_PACKAGE;
    }
  }
  
  /**
   * Translate JSON Sequence Diagram to UML sequence diagram
   * @param {Object} options
   * @param {Object} sequenceDiagramJson
   */
  translateJsonSequenceDiagram(options, sequenceDiagramJson) {
    // Create collaboration
    const collaboration = new type.UMLCollaboration();
    collaboration.name = sequenceDiagramJson.name || "Collaboration";
    
    // Create interaction
    const interaction = new type.UMLInteraction();
    interaction.name = "Interaction";
    interaction._parent = collaboration;
    collaboration.ownedElements.push(interaction);
 
    // Store references
    this._collaboration = collaboration;
    this._interaction = interaction;
    
    // Map to store participant ID to UMLClassifierRole
    this._participantMap = {};
    
    // Create participants (UMLClassifierRole)
    if (sequenceDiagramJson.participants) {
      sequenceDiagramJson.participants.forEach((participant) => {
        this._createParticipant(participant);
      });
    }
    
    // Create messages
    if (sequenceDiagramJson.sequences) {
      sequenceDiagramJson.sequences.forEach((sequence) => {
        if (sequence.messages) {
          sequence.messages.forEach((messageJson) => {
            this._createMessage(messageJson);
          });
        }
      });
    }
    
    console.log("[JSON Reverse Engineer] Sequence diagram structure created:", collaboration.name);
  }
  
  /**
   * Create participant (UMLLifeline) from JSON
   * @param {Object} participantJson
   */
  _createParticipant(participantJson) {
    // Create participant as UMLLifeline
    const lifeline = new type.UMLLifeline();
    lifeline.name = participantJson.display_name;
    lifeline.selector = participantJson.name;
    
    // Add to interaction (not directly to sequence diagram)
    lifeline._parent = this._interaction;
    this._interaction.ownedElements.push(lifeline);
    
    // Also add to interaction's participants array
    this._interaction.participants.push(lifeline);
    
    // Store reference in participant map using activity_id
    if (participantJson.activities && participantJson.activities.length > 0) {
      const activityId = participantJson.activities[0].id;
      this._participantMap[activityId] = lifeline;
      
      // Also map other activities if present
      if (participantJson.activities.length > 1) {
        participantJson.activities.slice(1).forEach((activity) => {
          this._participantMap[activity.id] = lifeline;
        });
      }
      
      console.log("Created participant:", lifeline.name, "with activity_id:", activityId);
    } else {
      // Fall back to participant ID if no activities
      this._participantMap[participantJson.id] = lifeline;
      console.log("Created participant:", lifeline.name, "with participant_id:", participantJson.id);
    }
  }
  
  /**
   * Create a single message from JSON
   * @param {Object} messageJson
   */
  _createMessage(messageJson) {
    // Get source and target participants using activity_id
    let sourceParticipant = null;
    let targetParticipant = null;
    
    // Safely check for from and to properties
    if (messageJson.from && messageJson.from.activity_id) {
      sourceParticipant = this._participantMap[messageJson.from.activity_id];
    } else {
      console.warn("Message source or source.activity_id is undefined:", messageJson);
      return;
    }
    
    if (messageJson.to && messageJson.to.activity_id) {
      targetParticipant = this._participantMap[messageJson.to.activity_id];
    } else {
      console.warn("Message target or target.activity_id is undefined:", messageJson);
      return;
    }
    
    if (sourceParticipant && targetParticipant) {
      // Create message
      const message = new type.UMLMessage();
      message.name = messageJson.name;
      message.source = sourceParticipant;
      message.target = targetParticipant;
      message.messageKind = type.UMLMessage.MK_SYNCH_CALL; // Default to synchronous call
      
      // Add to interaction
      message._parent = this._interaction;
      this._interaction.ownedElements.push(message);
      
      // Also add to interaction's messages array
      this._interaction.messages.push(message);
      
      console.log("Created message:", messageJson.name, "from", sourceParticipant.name, "to", targetParticipant.name);
    } else {
      console.warn("Skipping message creation: source or target participant not found");
      console.warn("Available participants in map:", Object.keys(this._participantMap));
      console.warn("Message from activity_id:", messageJson.from.activity_id);
      console.warn("Message to activity_id:", messageJson.to.activity_id);
    }
  }
  
  /**
   * Find type by name
   * @param {type.ModelElement} context
   * @param {string} name
   * @param {Object} compilationUnitNode
   * @return {type.UMLClassifier}
   */
  _findType(context, name, compilationUnitNode) {
    // Simple implementation for finding types
    let parent = context;
    while (parent) {
      // Check in current package
      for (const child of parent.ownedElements) {
        if (child instanceof type.UMLClassifier && child.name === name) {
          return child;
        }
      }
      
      // Check in parent package
      parent = parent._parent;
    }
    
    return null;
  }
}

/**
 * Analyze all JSON files in basePath
 * @param {string} basePath
 * @param {Object} options
 */
function analyzeJson(basePath, options) {
  // Collect all JSON files first
  const jsonFiles = [];
  
  function collectJsonFiles(base) {
    try {
      var stat = fs.lstatSync(base);
      if (stat.isFile()) {
        var ext = path.extname(base).toLowerCase();
        if (ext === ".json") {
          jsonFiles.push(base);
        }
      } else if (stat.isDirectory()) {
        var files = fs.readdirSync(base);
        if (files && files.length > 0) {
          files.forEach((entry) => {
            var fullPath = path.join(base, entry);
            collectJsonFiles(fullPath);
          });
        }
      }
    } catch (err) {
      console.error(`Error visiting ${base}:`, err);
    }
  }
  
  collectJsonFiles(basePath);
  
  // Process each JSON file individually
  jsonFiles.forEach((jsonPath) => {
    try {
      // Extract filename without extension for model name
      const fileName = path.basename(jsonPath, path.extname(jsonPath));
      
      console.log(`\nProcessing JSON file: ${jsonPath}`);
      console.log(`Creating model: ${fileName}`);
      
      // Create a new analyzer for each JSON file
      var jsonAnalyzer = new JsonCodeAnalyzer(options, fileName);
      
      // Add the JSON file to the analyzer
      jsonAnalyzer.addJsonFile(jsonPath);
      
      // Analyze and generate diagrams for this file
      jsonAnalyzer.analyze(options);
      
      console.log(`Finished processing: ${fileName}`);
    } catch (err) {
      console.error(`Error processing JSON file ${jsonPath}:`, err);
    }
  });
}

// Export the analyzer
module.exports = {
  analyzeJson: analyzeJson
};
