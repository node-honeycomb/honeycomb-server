{
  /**
   * if record location info
   * @type {Boolean}
   */
  var flagLoc = options.loc;
}
config
  = sts: (statement*) {
    return {
      type: 'root',
      statements: sts
    }
  }

statement = st:(statement_not_empty / comment) end {
  return st;
}

statement_not_empty = st:(
  statement_simple /
  statement_block /
  statement_value_block
) cmt:comment? end {
      if (st) {
        if (cmt) {
          st.comment = cmt;
        }
        if (flagLoc) {
          st.location = location();
        }
        return st;
      } else {
        return cmt;
      }
    }

statement_simple
  = _ k:key _ v:values _ sem {
    return {
      key: k,
      value: v,
      type: 'statement'
    }
 }

statement_block = _ k:key _ v:block {
  return {
    key: k,
    type: 'statement',
    block: v
  }
}

statement_value_block = _ k:key _ v:values _ b:block {
  return {
    key: k,
    type: 'statement',
    value: v,
    block: b
  }
}



// key v1 v2 v3 v4; #comments
key = $([0-9a-zA-Z/_\-.*]+) / literal_string

values = v1:single_value v2:(_ v3:single_value{return v3})* {
    if (v2) {
      return [v1].concat(v2);
    } else {
      return v1;
    }
}

comment = w:__ '#' v:([^\r\n]*) {
  let loc = location();
  loc.start.column = w.length;
  return {
    type: 'comment',
    value: v.join(''),
    loc: flagLoc ? loc : undefined
  }
}

// 值项
single_value = literal_string / literal_value

block
  = block_open __ cmt:(comment end / end)? sts:(statement*) _ block_close {
    return {
      type: 'block',
      statements: sts,
      comments: [cmt[0]]
    }
 }

block_open 'BLOCK' = '{'
block_close 'BLOCK_END' = '}'

literal_value
  = literal_value_start_with_word /
    literal_value_start_with_escaped

literal_value_start_with_word
  = v:(nginx_word $(escaped nginx_word?)*) {
  return {
    loc: flagLoc ? location() : undefined,
    value: v.join('')
  }
}
literal_value_start_with_escaped
  'NG_VALUE' = v:(escaped $(nginx_word escaped?)*) {
    return {
      loc: flagLoc ? location() : undefined,
      value: v.join('')
    }
  }

escaped 'NG_VALUE' = $($('\\' .)+)
nginx_word 'NG_VALUE' =$([^ \r\n\t\\\{\}\;]+)

literal_string 'STRING'
  = ca:( ('"' double_char* '"')
        /("'" single_char* "'")) {
      return {
        type  : 'string',
        value : ca[1].join(''),
        loc: flagLoc ? location() : undefined
      }
    }

single_char
  = [^'\\\0-\x1F\x7f]
  / escape_char

double_char
  = [^"\\\0-\x1F\x7f]
  / escape_char

escape_char
  = "\\'"  { return "'";  }
  / '\\"'  { return '"';  }
  / "\\\\" { return "\\"; }
  / "\\/"  { return "/";  }
  / "\\b"  { return "\b"; }
  / "\\f"  { return "\f"; }
  / "\\n"  { return "\n"; }
  / "\\r"  { return "\r"; }
  / "\\t"  { return "\t"; }
  / "\\u" h1:hexDigit h2:hexDigit h3:hexDigit h4:hexDigit {
      return String.fromCharCode(parseInt("0x" + h1 + h2 + h3 + h4));
    }

line_terminator
  = [\n\r]

literal_numeric
  = n:number {
      return {
        type  : 'number',
        value : n
      }
    }
literal_int "LITERAL INT"
  = n:int {
    return {
      type: 'number',
      value: n
    }
  }

number
  = int_:int frac:frac exp:exp _ { return parseFloat(int_ + frac + exp); }
  / int_:int frac:frac _         { return parseFloat(int_ + frac);       }
  / int_:int exp:exp _           { return parseFloat(int_ + exp);        }
  / int_:int _                   { return parseFloat(int_);              }

int
  = digit19:digit19 digits:digits     { return digit19 + digits;       }
  / digit:digit
  / op:("-" / "+" ) digit19:digit19 digits:digits { return "-" + digit19 + digits; }
  / op:("-" / "+" ) digit:digit                   { return "-" + digit;            }

frac
  = "." digits:digits { return "." + digits; }

exp
  = e:e digits:digits { return e + digits; }

digits
  = digits:digit+ { return digits.join(""); }

digit "NUMBER"  = [0-9]
digit19 "NUMBER" = [1-9]

hexDigit "HEX"
  = [0-9a-fA-F]

e
  = e:[eE] sign:[+-]? { return e + sign; }

sem 'SEMI' = ';'

__ 'WHITE' = $([ \t]*)
_ 'WHITE' =
  ws*

ws 'WHITE_SPACE' = [ \t\r\n]

end 'END' = ([\r\n]+ / '') {
  return '';
}