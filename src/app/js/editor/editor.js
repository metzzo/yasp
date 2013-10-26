if (typeof yasp == 'undefined') yasp = { };

(function() {
  var fireDataReceived;
  
  yasp.CompileManager = {
    lastCompile: null,
    commands: null,
    registers: null,
    compile: function(content, cb) {
      if (content != this.lastUpdate) {
        this.lastUpdate = content;
        console.log("update");
        yasp.AssemblerCommunicator.sendMessage("assemble", {
          code: content,
          jobs: ['symbols', 'map']
        }, function(response) {
          // update yasp.Editor
          if (!!response.payload) {
            yasp.Editor.map = response.payload.map;
            yasp.Editor.symbols = response.payload.symbols;
            
            // update orderedSymbols
            var osymbols = yasp.Editor.orderedSymbols;
            osymbols.length = 0;
            var instructions = yasp.Editor.symbols.instructions;
            for (var k in instructions) {
              osymbols.push(k);
            }
            var labels = yasp.Editor.symbols.labels;
            for (var k in labels) {
              osymbols.push(labels[k].text);
            }
            var usedRegisters = yasp.Editor.symbols.usedRegisters;
            for (var k in usedRegisters) {
              osymbols.push(k);
            }
            var defines = yasp.Editor.symbols.defines;
            for (var k in defines) {
              osymbols.push(k);
            }
            osymbols.sort(function(a, b) {
              var aCount = yasp.Editor.getIdentifierOccurence(a);
              var bCount = yasp.Editor.getIdentifierOccurence(b);
              
              return bCount - aCount;
            });
            
            // init commands if uninitialized
            if (!this.commands) {
              this.commands = [ ];
              var added = { }
              for (var i = 0; i < yasp.commands.length; i++) {
                var commandName = yasp.commands[i].name;
                for (var j = 0; j < (commandName instanceof Array ? commandName.length : 1); j++) {
                  var name = commandName instanceof Array ? commandName[j] : commandName;
                  if (!added[name] && !yasp.Editor.symbols.instructions[name] && name != null) {
                    this.commands.push(name);
                    added[name] = 42;
                  }
                }
              }
              this.commands.sort();
            }
            
            // add commands
            var added = { }
            for (var i = 0; i < this.commands.length; i++) {
              var name = this.commands[i];
              if (!added[name] && !yasp.Editor.symbols.instructions[name] && name != null) {
                osymbols.push(name);
                added[name] = 42;
              }
            }
            
            // init registers
            if (!this.registers) this.registers = yasp.Lexer.getRegisters();
            
            // add registers
            for (var i = 0; i < this.registers.length; i++) {
              if (!usedRegisters[this.registers[i]]) osymbols.push(this.registers[i]);
            }
            
            fireDataReceived();
          }
          
          cb(response);
        });
      } else {
        cb(null);
      }
    }
  }
  yasp.CompileManager.compile = yasp.CompileManager.compile.bind(yasp.CompileManager);
  
  yasp.Editor = {
    map: { },
    symbols: {
      labels: { },
      instructions: { },
      usedRegisters: { },
      defines: { }
    },
    orderedSymbols: [],
    labelText: "",
    getIdentifierOccurence: function(name) {
      if (!!yasp.Editor.symbols.instructions[name]) return yasp.Editor.symbols.instructions[name];
      if (!!yasp.Editor.symbols.usedRegisters[name]) return yasp.Editor.symbols.usedRegisters[name];
      return 0;
    }
  };
  
  // yasp.EmulatorCommunicator = new yasp.Communicator("emulator/emulator.js");
  yasp.AssemblerCommunicator = new yasp.Communicator("app/js/assembler/assembler_backend.js");
  
  $('body').ready(function() {
    // initialize code mirror textarea
    var editor = CodeMirror.fromTextArea($('#editor').get(0), {
      mode: "text/assembler",
      theme: 'eclipse',
      lineNumbers: true,
      undoDepth: 100,
      autofocus: true,
      indentUnit: 8,
      tabSize: 8,
      indentWithTabs: true
    });
    
    
    // force intendation everytime something changes
    editor.on("change", function() {
      var c = editor.getCursor();
      if (!!c) {
        var content = editor.getLine(c.line);
        editor.indentLine(c.line);
        // fix bug introduced in Commit #32d7db0cf78f5ed9dde3450ad885ced98851271b that causes the input to be fucked up...
        if (editor.getLine(c.line) != content) {
          c.ch++; // if you ever add multiple levels of intendation this should be changed into somehting more intelligent
        }
        editor.setCursor(c);
        
        setTimeout(function() { // fixes bug that causes the completition dialog to be immediately closed
          CodeMirror.commands.autocomplete(editor);
        }, 0);
      }
    });
    
    // update symbols
    var UPDATE_DELAY = 500;
    var update, first = true;
    (update = function() {
      var content = editor.getValue();
      yasp.CompileManager.compile(content, function(result) {
        if (first) editor.setValue(content); // force update of existing labels
        first = false;
        
        setTimeout(update, UPDATE_DELAY)
      });
    })();
    
    // update label list
    fireDataReceived = function() {
      // build new label list text
      var text = "<ul>";
      var labels = yasp.Editor.symbols.labels;
      for (var l in labels) {
        text += "<li>" + l + "</li>";
      }
      text += "</ul>";
      
      $('#labelcontent').html(text);
    };
    
    // hinting
    (function() {
      var delimiters = yasp.Lexer.getDelimiters();
      CodeMirror.registerHelper("hint", "assembler", function(editor, options) {
        var cur = editor.getCursor(), curLine = editor.getLine(cur.line);
        var start = cur.ch, end = start;
        while (end < curLine.length && delimiters.indexOf(curLine.charAt(end)) == -1) ++end;
        while (start && delimiters.indexOf(curLine.charAt(start - 1)) == -1) --start;
        var curWord = start != end && curLine.slice(start, end);
        if (!!curWord) {
          curWord = curWord.toUpperCase();
        } else {
          curWord = "";
        }
        console.log("Current Word: '"+curWord+"'");
        
        var symbols = [ ];
        var osymbols = yasp.Editor.orderedSymbols;
        for (var i = 0; i < osymbols.length; i++) {
          if ((osymbols[i].indexOf(curWord) == 0 && osymbols[i] != curWord) || curWord.length == 0) {
            symbols.push(osymbols[i]);
          }
        }
        
        return {list: symbols, from: CodeMirror.Pos(cur.line, start), to: CodeMirror.Pos(cur.line, end)};
      });

      CodeMirror.commands.autocomplete = function(cm) {
        CodeMirror.showHint(cm, CodeMirror.hint.assembler, {
          text: "",
          displayText: 'suggestions',
          completeSingle: false,
          alignWithWord: false,
          closeOnUnfocus: true
        });
      };
    })();
  });
})();