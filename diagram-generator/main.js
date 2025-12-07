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

const _ = require('lodash')

function _createViewOf (operationBuilder, diagram, model, suppressCompartments) {
  var view = null
  if (!(model instanceof type.Relationship)) {
    var ViewType = model.getViewType()
    if (ViewType) {
      view = new ViewType()
      view._parent = diagram
      view.model = model
      view.initialize(null, 10, 10, 10, 10)
      // In case of InterfaceView
      if (view instanceof type.UMLInterfaceView) {
        view.stereotypeDisplay = type.UMLGeneralNodeView.SD_ICON
      }
      // Suppress Compartments
      if (suppressCompartments) {
        if (typeof view.suppressAttributes !== 'undefined') {
          view.suppressAttributes = true
        }
        if (typeof view.suppressOperations !== 'undefined') {
          view.suppressOperations = true
        }
        if (typeof view.suppressLiterals !== 'undefined') {
          view.suppressLiterals = true
        }
      }
      operationBuilder.insert(view)
      operationBuilder.fieldInsert(diagram, 'ownedViews', view)
    }
  }
  return view
}

function _createEdgeViewsOf (operationBuilder, diagram, model, nodeViews, createdRels, typeFilter) {
  typeFilter = typeFilter || type.Element
  _.each(app.repository.getRelationshipsOf(model), rel => {
    if (rel instanceof typeFilter) {
      var view = nodeViews.find(nv => nv.model === model)
      var RelViewType = rel.getViewType()
      var relView
      if (!createdRels.includes(rel) && view && RelViewType) {
        // for Directed Relationships
        if (rel instanceof type.DirectedRelationship) {
          _.each(nodeViews, v => {
            if ((v.model === rel.target) && (model === rel.source)) {
              relView = new RelViewType()
              relView._parent = diagram
              relView.model = rel
              relView.tail = view
              relView.head = v
              relView.initialize(null, relView.tail.left, relView.tail.top, relView.head.left, relView.head.top)
              operationBuilder.insert(relView)
              operationBuilder.fieldInsert(diagram, 'ownedViews', relView)
            } else if ((v.model === rel.source) && (model === rel.target)) {
              relView = new RelViewType()
              relView._parent = diagram
              relView.model = rel
              relView.tail = v
              relView.head = view
              relView.initialize(null, relView.tail.left, relView.tail.top, relView.head.left, relView.head.top)
              operationBuilder.insert(relView)
              operationBuilder.fieldInsert(diagram, 'ownedViews', relView)
            }
          })

          // create self-links.
          if ((rel.source === rel.target) && (rel.source === model)) {
            relView = new RelViewType()
            relView._parent = diagram
            relView.model = rel
            relView.tail = view
            relView.head = view
            relView.initialize(null, relView.tail.left, relView.tail.top, relView.head.left, relView.head.top)
            operationBuilder.insert(relView)
            operationBuilder.fieldInsert(diagram, 'ownedViews', relView)
          }

        // for Undirected Relationships
        } else if (rel instanceof type.UndirectedRelationship) {
          _.each(nodeViews, v => {
            if ((v.model === rel.end2.reference) && (model === rel.end1.reference)) {
              relView = new RelViewType()
              relView._parent = diagram
              relView.model = rel
              relView.tail = view
              relView.head = v
              relView.initialize(null, relView.tail.left, relView.tail.top, relView.head.left, relView.head.top)
              operationBuilder.insert(relView)
              operationBuilder.fieldInsert(diagram, 'ownedViews', relView)
            } else if ((v.model === rel.end1.reference) && (model === rel.end2.reference)) {
              relView = new RelViewType()
              relView._parent = diagram
              relView.model = rel
              relView.tail = v
              relView.head = view
              relView.initialize(null, relView.tail.left, relView.tail.top, relView.head.left, relView.head.top)
              operationBuilder.insert(relView)
              operationBuilder.fieldInsert(diagram, 'ownedViews', relView)
            }
          })

          // create self-links.
          if ((rel.end1.reference === rel.end2.reference) && (rel.end1.reference === model)) {
            relView = new RelViewType()
            relView._parent = diagram
            relView.model = rel
            relView.tail = view
            relView.head = view
            relView.initialize(null, relView.tail.left, relView.tail.top, relView.head.left, relView.head.top)
            operationBuilder.insert(relView)
            operationBuilder.fieldInsert(diagram, 'ownedViews', relView)
          }
        }
      }
      createdRels.push(rel)
    }
  })
}

function _layoutDiagram (diagram, direction, separation) {
  var hiddenEditor = app.diagrams.getHiddenEditor()
  hiddenEditor.diagram = diagram
  hiddenEditor.repaint()
  hiddenEditor.repaint() // why should I run it twice?
  app.engine.layoutDiagram(hiddenEditor, diagram, direction, separation)
  hiddenEditor.repaint()
}

/**
* Create Overview Diagram of a given package (or namespace)
* @param {Element} base
* @param {boolean} suppressCompartments
* @param {boolean} doNotOpen
*/
function _handleOverview (base, suppressCompartments, doNotOpen) {
  if (!base) {
    var selected = app.selections.getSelected()
    if (selected instanceof type.UMLPackage) {
      base = selected
    }
  }
  if (base) {
    // Prepare an operation
    var operationBuilder = app.repository.getOperationBuilder()
    operationBuilder.begin('add diagram')

    // Create overview diagram
    var diagram = new type.UMLClassDiagram()
    diagram._parent = base
    diagram.name = 'Overview'
    operationBuilder.insert(diagram)
    operationBuilder.fieldInsert(base, 'ownedElements', diagram)

    // Create node views
    var i, len, model, view
    var nodeViews = []
    for (i = 0, len = base.ownedElements.length; i < len; i++) {
      model = base.ownedElements[i]
      view = _createViewOf(operationBuilder, diagram, model, suppressCompartments)
      if (view) { nodeViews.push(view) }
    }

    // Create edge views
    var createdRels = []
    for (i = 0, len = base.ownedElements.length; i < len; i++) {
      model = base.ownedElements[i]
      _createEdgeViewsOf(operationBuilder, diagram, model, nodeViews, createdRels)
    }

    // Excute operation
    operationBuilder.end()
    var cmd = operationBuilder.getOperation()
    app.repository.doOperation(cmd)
    diagram = app.repository.get(diagram._id)

    // Layout Diagram
    _layoutDiagram(diagram)

    // Open Diagram
    if (!doNotOpen) {
      app.diagrams.openDiagram(diagram)
      app.diagrams.repaint()
    }
  } else {
    app.dialogs.showInfoDialog('要生成概述图表，请选择一个包。')
  }
}

function _handleOverviewSuppressed (base, doNotOpen) {
  _handleOverview(base, true, doNotOpen)
}

function _handleOverviewExpanded (base, doNotOpen) {
  _handleOverview(base, false, doNotOpen)
}

/**
 * Create Type Hierarchy Diagram
 * @param {Element} base
 * @param {boolean} doNotOpen
 */
function _handleTypeHierarchy (base, doNotOpen) {
  function _isType (elem) {
    return (elem instanceof type.UMLClass) ||
    (elem instanceof type.UMLInterface) ||
    (elem instanceof type.UMLEnumeration) ||
    (elem instanceof type.UMLSignal) ||
    (elem instanceof type.UMLDataType)
  }

  if (!base) {
    var selected = app.selections.getSelected()
    if (selected instanceof type.UMLPackage) {
      base = selected
    }
  }
  if (base) {
    // Prepare an operation
    var operationBuilder = app.repository.getOperationBuilder()
    operationBuilder.begin('add diagram')

    // Collect all types in base element
    var allTypes = []
    base.traverse(function (elem) {
      if (_isType(elem)) {
        allTypes.push(elem)
      }
    })

    // Create type hierarchy diagram
    var diagram = new type.UMLClassDiagram()
    diagram._parent = base
    diagram.name = 'Type Hierarchy'
    operationBuilder.insert(diagram)
    operationBuilder.fieldInsert(base, 'ownedElements', diagram)

    // Create type nodes
    var nodeViews = []
    base.traverse(function (elem) {
      if (_isType(elem)) {
        var view = _createViewOf(operationBuilder, diagram, elem, true)
        if (view) { nodeViews.push(view) }
      }
    })

    // Create generalizations and interface realizations
    var createdRels = []
    nodeViews.forEach(nv => {
      if (nv.model) {
        _createEdgeViewsOf(operationBuilder, diagram, nv.model, nodeViews, createdRels, type.UMLGeneralization)
        _createEdgeViewsOf(operationBuilder, diagram, nv.model, nodeViews, createdRels, type.UMLInterfaceRealization)
      }
    })

    // Excute operation
    operationBuilder.end()
    var cmd = operationBuilder.getOperation()
    app.repository.doOperation(cmd)
    diagram = app.repository.get(diagram._id)

    // Layout Diagram
    _layoutDiagram(diagram, app.type.Diagram.LD_LR, { node: 10, edge: 10, rank: 100 })

    // Open Diagram
    if (!doNotOpen) {
      app.diagrams.openDiagram(diagram)
      app.diagrams.repaint()
    }
  } else {
    app.dialogs.showInfoDialog('要生成类型层次图表，请选择一个包。')
  }
}

/**
* Create Package Structure Diagram
* @param {Element} base
* @param {boolean} doNotOpen
*/
function _handlePackageStructure (base, doNotOpen) {
  function _testParentView (v) {
    return (v.model === view.model._parent)
  }

  if (!base) {
    var selected = app.selections.getSelected()
    if (selected instanceof type.UMLPackage) {
      base = selected
    }
  }
  if (base) {
    // Prepare an operation
    var operationBuilder = app.repository.getOperationBuilder()
    operationBuilder.begin('add diagram')

    // Create package diagram
    var diagram = new type.UMLPackageDiagram()
    diagram._parent = base
    diagram.name = 'Package Structure'
    operationBuilder.insert(diagram)
    operationBuilder.fieldInsert(base, 'ownedElements', diagram)

    // Create package views
    var nodeViews = []
    base.traverse(function (elem) {
      if (elem !== base && elem instanceof type.UMLPackage) {
        var view = _createViewOf(operationBuilder, diagram, elem, true)
        if (view) { nodeViews.push(view) }
      }
    })

    // Create containment views
    var i, len, view
    for (i = 0, len = nodeViews.length; i < len; i++) {
      view = nodeViews[i]
      var parentView = _.find(nodeViews, _testParentView)
      if (parentView) {
        var containmentView = new type.UMLContainmentView()
        containmentView._parent = diagram
        containmentView.tail = view
        containmentView.head = parentView
        containmentView.initialize(null, containmentView.tail.left, containmentView.tail.top, containmentView.head.left, containmentView.head.top)
        operationBuilder.insert(containmentView)
        operationBuilder.fieldInsert(diagram, 'ownedViews', containmentView)
      }
    }

    // Excute operation
    operationBuilder.end()
    var cmd = operationBuilder.getOperation()
    app.repository.doOperation(cmd)
    diagram = app.repository.get(diagram._id)

    // Layout Diagram
    _layoutDiagram(diagram)

    // Open Diagram
    if (!doNotOpen) {
      app.diagrams.openDiagram(diagram)
      app.diagrams.repaint()
    }
  } else {
    app.dialogs.showInfoDialog('要生成包结构图表，请选择一个包。')
  }
}

/**
 * Create Sequence Diagram
 * @param {Element} base
 * @param {boolean} doNotOpen
 */
function _handleSequence (base, doNotOpen) {
  console.log('_handleSequence() execute');
  if (!base) {
    var selected = app.selections.getSelected()
    if (selected instanceof type.UMLPackage) {
      base = selected
    }
  }
  if (base) {
    // Prepare an operation
    var operationBuilder = app.repository.getOperationBuilder()
    operationBuilder.begin('add sequence diagram')

    // Create collaboration and interaction
    var collaboration = new type.UMLCollaboration()
    collaboration._parent = base
    collaboration.name = 'Collaboration'
    operationBuilder.insert(collaboration)
    operationBuilder.fieldInsert(base, 'ownedElements', collaboration)

    var interaction = new type.UMLInteraction()
    interaction._parent = collaboration
    interaction.name = 'Interaction'
    operationBuilder.insert(interaction)
    operationBuilder.fieldInsert(collaboration, 'ownedElements', interaction)

    // Create sequence diagram
    var diagram = new type.UMLSequenceDiagram()
    diagram._parent = base
    diagram.name = 'Sequence'
    operationBuilder.insert(diagram)
    operationBuilder.fieldInsert(base, 'ownedElements', diagram)

    // Create lifelines for relevant elements
    var lifelines = []
    var nodeViews = []
    
    // Traverse elements to create lifelines
    base.traverse(function (elem) {
      // Create lifelines for classes and interfaces
      if (elem instanceof type.UMLClass || elem instanceof type.UMLInterface) {
        var lifeline = new type.UMLLifeline()
        lifeline._parent = interaction
        lifeline.name = elem.name
        lifeline.represents = elem
        operationBuilder.insert(lifeline)
        operationBuilder.fieldInsert(interaction, 'lifelines', lifeline)
        lifelines.push(lifeline)

        // Create lifeline view
        var view = _createViewOf(operationBuilder, diagram, lifeline)
        if (view) {
          nodeViews.push(view)
        }
      }
    })

    // Create messages between lifelines (simplified - just for demonstration)
    // In a real implementation, you would analyze the actual interactions
    if (lifelines.length > 1) {
      for (var i = 0; i < lifelines.length - 1; i++) {
        var message = new type.UMLMessage()
        message._parent = interaction
        message.name = 'message'
        message.sendEvent = new type.UMLMessageOccurrenceSpecification()
        message.receiveEvent = new type.UMLMessageOccurrenceSpecification()
        message.sendEvent._parent = interaction
        message.receiveEvent._parent = interaction
        message.sendEvent.covered = lifelines[i]
        message.receiveEvent.covered = lifelines[i + 1]
        operationBuilder.insert(message)
        operationBuilder.fieldInsert(interaction, 'messages', message)
        operationBuilder.insert(message.sendEvent)
        operationBuilder.insert(message.receiveEvent)

        // Create message view
        var relView = new type.UMLMessageView()
        relView._parent = diagram
        relView.model = message
        
        // Find the corresponding views for the lifelines
        var sendView = nodeViews.find(v => v.model === lifelines[i])
        var receiveView = nodeViews.find(v => v.model === lifelines[i + 1])
        
        if (sendView && receiveView) {
          relView.tail = sendView
          relView.head = receiveView
          relView.initialize(null, relView.tail.left, relView.tail.top, relView.head.left, relView.head.top)
          operationBuilder.insert(relView)
          operationBuilder.fieldInsert(diagram, 'ownedViews', relView)
        }
      }
    }

    // Execute operation
    operationBuilder.end()
    var cmd = operationBuilder.getOperation()
    app.repository.doOperation(cmd)
    diagram = app.repository.get(diagram._id)

    // Layout Diagram
    _layoutDiagram(diagram)

    // Open Diagram
    if (!doNotOpen) {
      app.diagrams.openDiagram(diagram)
      app.diagrams.repaint()
    }
  } else {
    app.dialogs.showInfoDialog('要生成序列图表，请选择一个LifeLine 或 Message。')
  }
}

function init () {
  // Register Commands
  app.commands.register('diagram-generator:overview', _handleOverviewSuppressed, 'Diagram Generator: Overview')
  app.commands.register('diagram-generator:overview-expanded', _handleOverviewExpanded, 'Diagram Generator: Overview Expanded')
  app.commands.register('diagram-generator:type-hierarchy', _handleTypeHierarchy, 'Diagram Generator: Type Hierarchy')
  app.commands.register('diagram-generator:package-structure', _handlePackageStructure, 'Diagram Generator: Package Structure')
  app.commands.register('diagram-generator:sequence', _handleSequence, 'Diagram Generator: Sequence')
}

exports.init = init
