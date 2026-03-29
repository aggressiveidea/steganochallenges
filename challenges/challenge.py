import os 
from pwn import xor

key = os.urandom(8)


flag = open('flag.png' , 'rb').read()
xored_flag = xor(flag , key)

open('lost.png' , 'wb').write(xored_flag)