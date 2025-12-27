with open('/home/run0/whitelist/spa/src/modules/classrooms.ts', 'r') as f:
    lines = f.readlines()

# Fix line 146 (0-indexed as 145) - remove the literal \n characters  
lines[145] = '        })();\n'

with open('/home/run0/whitelist/spa/src/modules/classrooms.ts', 'w') as f:
    f.writelines(lines)

print('Fixed')
