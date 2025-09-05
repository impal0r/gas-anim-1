import markdown
import sys

def copy_to_clipboard(text):
    import tkinter as tk
    root = tk.Tk()
    root.withdraw()
    root.clipboard_clear()
    root.clipboard_append(text)
    root.destroy()

def is_final_pause_needed():
    '''Check if this script was launched by double clicking the file
    in the Windows File Explorer GUI'''
    import ctypes
    try:
        # Load kernel32.dll
        kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        # Create an array to store the processes in.  This doesn't actually
        # need to be large enough to store the whole process list since
        # GetConsoleProcessList() just returns the number of processes if the
        # array is too small.
        process_array = (ctypes.c_uint * 1)()
        num_processes = kernel32.GetConsoleProcessList(process_array, 1)
        # num_processes may be 1 if your compiled program doesn't have a
        # launcher/wrapper.
        return num_processes == 2
    except AttributeError: #ctypes.WinDLL presumably doesn't exist outside Windows
        return False

class CannotContinue(Exception):
    pass

if __name__ == '__main__':

    try:
        if len(sys.argv) > 2:
            raise CannotContinue()
        if len(sys.argv) == 1:
            file_path = input('Path to .md file: ')
        else:
            file_path = sys.argv[1]

        # Note: not sanitizing the file path as this script is only intended
        # to be used by a developer on their local machine
        try:
            with open(file_path) as file:
                md = file.read()
        except FileNotFoundError:
            print('File not found')
            raise CannotContinue()
##        except IOError:
##            print('Unable to open file')
##            raise CannotContinue()

        # The markdown library does not cause errors if I remember correctly
        copy_to_clipboard(markdown.markdown(md))
        print('Copied HTML to clipboard!')

    except CannotContinue:
        print('Usage: python get_html_from_md.py [path to .md file]')

    if is_final_pause_needed():
        print()
        input('Press ENTER to continue...')
