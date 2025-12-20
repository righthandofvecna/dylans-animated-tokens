
import json
import os
import re

# get local settings
with open("local.json", "r") as local:
    data = json.load(local)
    FOUNDRYV13 = data["FOUNDRYV13"]
    FOUNDRY_JS_PATH = os.path.join(FOUNDRYV13, "resources", "app", "public", "scripts", "foundry.mjs")
TOKEN_MJS_PATH = os.path.join("js", "foundry", "token.mjs")


def extract_class(filepath, className):
    """
    Extract the Token class definition from a JavaScript file.
    
    Args:
        filepath (str): Path to the JavaScript file to parse
        
    Returns:
        str: The complete Token class definition, or None if not found
    """
    with open(filepath, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Find the start of the class definition
    start_index = content.find(f"class {className} ")
    if start_index == -1:
        return None
    
    # Find the end of the class definition
    braces_count = 0
    end_index = start_index
    for i in range(start_index, len(content)):
        if content[i] == '{':
            braces_count += 1
        elif content[i] == '}':
            braces_count -= 1
            if braces_count == 0:
                end_index = i + 1
                break
    
    if start_index != end_index:
        return content[start_index:end_index]


def get_members(class_definition):
    """
    Extract the members of a class from its definition.
    
    Args:
        class_definition (str): The class definition as a string
        
    Returns:
        list: A list of member names
    """
    members = []
    brace_level = -1
    paren_level = 0
    is_line_comment = False
    is_block_comment = False

    has_data = False

    last_member = 0
    for c in range(len(class_definition)):
        if class_definition[c] == '(' and not is_line_comment and not is_block_comment:
            paren_level += 1
        elif class_definition[c] == ')' and not is_line_comment and not is_block_comment:
            paren_level -= 1
        # find function members
        elif class_definition[c] == '{' and not is_line_comment and not is_block_comment:
            brace_level += 1
            if brace_level == 0 and paren_level == 0:
                last_member = c + 1
        elif class_definition[c] == '}' and not is_line_comment and not is_block_comment:
            brace_level -= 1
            if brace_level == -1:
                # End of class definition
                break
            if brace_level == 0 and paren_level == 0:
                # End of member
                if has_data:
                    member = class_definition[last_member:c+1].strip()
                    members.append(member)
                    has_data = False
                last_member = c + 1
        # find variable members
        elif brace_level == 0 and paren_level == 0 and class_definition[c] == ';' and not is_line_comment and not is_block_comment:
            # End of member
            if has_data:
                member = class_definition[last_member:c+1].strip()
                members.append(member)
                has_data = False
            last_member = c + 1
        elif has_data and brace_level == 0 and paren_level == 0 and class_definition[c] == '\n' and not is_line_comment and not is_block_comment:
            # End of member
            member = class_definition[last_member:c+1].strip()
            members.append(member)
            has_data = False
            last_member = c + 1
        
        # find comments
        elif class_definition[c] == '/' and class_definition[c+1] == '*':
            is_block_comment = True
        elif class_definition[c] == '/' and class_definition[c-1] == '*' and not class_definition[c-2] == '/':
            is_block_comment = False
        elif class_definition[c] == '/' and class_definition[c+1] == '/' and not is_block_comment:
            is_line_comment = True
        elif class_definition[c] == '\n':
            is_line_comment = False
        
        elif not has_data and brace_level >= 0 and class_definition[c].strip() != "" and not is_line_comment and not is_block_comment:
            has_data = True
    
    # add semicolons to the end of each member if it doesn't have one
    for i in range(len(members)):
        if not members[i].endswith(";"):
            members[i] += ";"
    return members


def transform_members(members, oldCls, newCls):
    """
    Convert private members to public by replacing the leading # with _PRIVATE_.
    
    Args:
        member (str): The member string to convert
        
    Returns:
        str: The converted member string
    """
    transformed_members = []
    for member in members:
        transformed = False
        if "#" in member:
            member = member.replace("#", "_PRIVATE_")
        if f"{oldCls}._PRIVATE_" in member:
            member = member.replace(f" {oldCls}._PRIVATE_", f" {newCls}._PRIVATE_")
        withoutComments = re.sub(r'(\/\/.*)|(\/\*[\s\S]*?\*\/)', '', member, flags=re.MULTILINE)
        if "_PRIVATE_" in withoutComments:
            transformed_members.append(member)
    return transformed_members

def generate_token_class():
    """
    Generate the Token class definition from the foundry.mjs file.
    
    Returns:
        str: The Token class definition as a string
    """
    token_class = extract_class(FOUNDRY_JS_PATH, "Token")
    token_members = get_members(token_class)
    transformed_members = transform_members(token_members, "Token", "NonPrivateToken")

    # do a couple of other misc changes
    def replace_in_members(old, new):
        for i, member in enumerate(transformed_members):
            if old in member:
                member = member.replace(old, new)
                transformed_members[i] = member
    replace_in_members("offsetX ??= this._PRIVATE_centerOffset.x", "offsetX ??= this._PRIVATE_centerOffset?.x || 0")
    replace_in_members("offsetY ??= this._PRIVATE_centerOffset.y", "offsetY ??= this._PRIVATE_centerOffset?.y || 0")
    replace_in_members("super._onUpdate(", "PlaceableObject.prototype._onUpdate.call(this, ")
    replace_in_members("name: this.movementAnimationName,", "...(options.animation ?? {}),\n          name: this.movementAnimationName,")

    with open(TOKEN_MJS_PATH, "w", encoding="utf-8") as outfile:
        outfile.write("""const { PointMovementSource } = foundry.canvas.sources;
const { PreciseText } = foundry.canvas.containers;
const { PrimarySpriteMesh } = foundry.canvas.primary;
const { PlaceableObject } = foundry.canvas.placeables;
const { Ray } = foundry.canvas.geometry;
const { CanvasAnimation } = foundry.canvas.animation;
const { PrimaryCanvasGroup } = foundry.canvas.groups;
const { InvisibilityFilter } = foundry.canvas.rendering.filters;
const { loadTexture } = foundry.canvas;
const { REGION_MOVEMENT_SEGMENTS } = CONST;\n\n""")
        outfile.write("export function NonPrivateTokenMixin(TokenClass) {\n  return class NonPrivateToken extends TokenClass {")
        for member in transformed_members:
            outfile.write(f"\n  {member}\n")
        outfile.write("}\n}\n\n")
    

generate_token_class()